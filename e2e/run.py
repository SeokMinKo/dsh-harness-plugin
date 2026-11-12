"""Execute the installed DSH Team Chat E2E suite and write JSON evidence."""

import argparse
from contextlib import nullcontext
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tarfile
from tempfile import TemporaryDirectory
from time import monotonic

from browser_cases import run_browser
from desktop_cases import DesktopHost, run_desktop
from allocation_cases import run_allocation_browser, run_allocation_host, run_allocation_migration, run_checkpoint_upgrade
from harness import CORE_VERSION, Host, ROOT, redacted, resolve_runtime
from host_cases import run_host, run_migration, run_recovery
from workflow_cases import run_workflow_browser, run_workflow_host


def package_info(path):
    with tarfile.open(path) as archive:
        metadata = json.load(archive.extractfile('package/package.json'))
    return {'file': path.name, 'version': metadata['version'], 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def run(options, workdir):
    target = options.package.resolve()
    previous = ROOT / 'packages' / 'dsh-team-chat-0.2.1.tgz'
    manifest = json.loads((ROOT / 'cases.json').read_text(encoding='utf-8'))
    groups_requested = options.group or [prefix for prefix in ('UI', 'HOST', 'REC', 'MIG', 'WF', 'WUI', 'AL', 'AUI', 'AM', 'AU', 'DT')
        if prefix != 'DT' or options.desktop_source]
    manifest = [case for case in manifest if case['id'].split('-')[0] in groups_requested]
    started = datetime.now(timezone.utc)
    rows = {case['id']: dict(case, status='BLOCKED', detail='선행 케이스 또는 호스트 준비 실패') for case in manifest}
    groups = {
        'UI': lambda host: run_browser(host, target, record, options.chromium),
        'HOST': lambda host: run_host(host, target, record),
        'REC': lambda host: run_recovery(host, target, record),
        'MIG': lambda host: run_migration(host, previous, target, record),
        'WF': lambda host: run_workflow_host(host, target, record),
        'WUI': lambda host: run_workflow_browser(host, target, record, options.chromium),
        'AL': lambda host: run_allocation_host(host, target, record),
        'AUI': lambda host: run_allocation_browser(host, target, record, options.chromium),
        'AM': lambda host: run_allocation_migration(host, ROOT / 'packages' / 'dsh-team-chat-0.3.0.tgz', target, record),
        'AU': lambda host: run_checkpoint_upgrade(host, ROOT / 'packages' / 'dsh-team-chat-0.3.1.tgz', target, record),
        'DT': lambda host: run_desktop(host, target, record, options.chromium),
    }

    def record(identifier, action):
        row = rows[identifier]
        stamp = monotonic()
        try:
            evidence = action()
            row.update(status='PASS')
            row.pop('detail', None)
            if evidence is not None:
                row['evidence'] = evidence
        except Exception as error:
            trace = sys.exc_info()[2]
            while trace.tb_next:
                trace = trace.tb_next
            frame = trace.tb_frame
            location = f'{Path(frame.f_code.co_filename).name}:{trace.tb_lineno}'
            row.update(status='FAIL', detail=redacted(f'{location} · {type(error).__name__}: {error}')[:3500])
        row['durationSeconds'] = round(monotonic() - stamp, 3)
        print(f"{row['status']:4} {identifier} · {row['title']}", flush=True)
        if row['status'] == 'FAIL':
            print('     ' + row['detail'], flush=True)
        return row['status'] == 'PASS'

    setup_errors = {}
    try:
        runtime = resolve_runtime(options.runtime_dir, workdir)
    except Exception as error:
        setup_errors['runtime'] = redacted(str(error))
    else:
        for prefix, group in groups.items():
            group_rows = [row for identifier, row in rows.items() if identifier.startswith(prefix + '-')]
            if not group_rows:
                continue
            try:
                if prefix == 'DT':
                    if not options.desktop_source or not options.desktop_pnpm:
                        raise RuntimeError('DT requires --desktop-source and --desktop-pnpm.')
                    context = DesktopHost(workdir / prefix.lower(), runtime, options.desktop_source.resolve(), options.desktop_pnpm.resolve())
                else:
                    context = Host(workdir / prefix.lower(), runtime)
                with context as host:
                    group(host)
            except Exception as error:
                setup_errors[prefix] = redacted(f'{type(error).__name__}: {error}')[:3500]
                print(f'BLOCKED {prefix} · {setup_errors[prefix]}', flush=True)
                for row in group_rows:
                    if row['status'] == 'BLOCKED':
                        row['detail'] = setup_errors[prefix]

    counts = {status: sum(row['status'] == status for row in rows.values()) for status in ('PASS', 'FAIL', 'BLOCKED')}
    node = subprocess.run(['node', '--version'], capture_output=True, text=True, check=False)
    result = {
        'startedUtc': started.isoformat(), 'finishedUtc': datetime.now(timezone.utc).isoformat(),
        'target': package_info(target), 'previous': package_info(previous), 'dshCore': CORE_VERSION,
        'environment': {'os': platform.system(), 'architecture': platform.machine(), 'python': platform.python_version(),
            'node': node.stdout.strip(), 'playwright': version('playwright'),
            'chromiumSingleProcess': os.environ.get('TEAM_CHAT_CHROMIUM_SINGLE_PROCESS') == '1',
            'model': 'Deterministic synthetic adapter in the actual native DSH Agent Team'},
        'counts': counts, 'setupErrors': setup_errors, 'cases': list(rows.values()),
    }
    options.results.parent.mkdir(parents=True, exist_ok=True)
    options.results.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(' '.join(f'{status}={count}' for status, count in counts.items()), flush=True)
    return int(bool(setup_errors or counts['FAIL'] or counts['BLOCKED']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-dir', type=Path, help='Use a directory containing the pinned DSH node_modules.')
    parser.add_argument('--chromium', help='Override the Playwright Chromium executable.')
    parser.add_argument('--package', type=Path, default=ROOT / 'packages' / 'dsh-team-chat-0.3.2.tgz')
    parser.add_argument('--group', choices=['UI', 'HOST', 'REC', 'MIG', 'WF', 'WUI', 'AL', 'AUI', 'AM', 'AU', 'DT'], nargs='+')
    parser.add_argument('--desktop-source', type=Path, help='Pinned upstream dsh-v0.2.2-rc.1 source checkout.')
    parser.add_argument('--desktop-pnpm', type=Path, help='Local pnpm package directory containing bin/pnpm.mjs.')
    parser.add_argument('--results', type=Path, default=Path('results.json'))
    parser.add_argument('--work-dir', type=Path, help='Use a fresh directory and keep the test-only DSH profile and logs.')
    options = parser.parse_args()
    with (nullcontext(str(options.work_dir)) if options.work_dir else TemporaryDirectory(prefix='team-chat-e2e-')) as location:
        workdir = Path(location).resolve()
        if options.work_dir:
            workdir.mkdir(parents=True)
        return run(options, workdir)


if __name__ == '__main__':
    sys.exit(main())

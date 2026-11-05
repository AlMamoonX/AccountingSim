"""Install only AccountingSim's route, preserving every existing shared VPS route."""
from datetime import datetime, timezone
from pathlib import Path
import shutil
import subprocess

target = Path('/opt/zarqa/deploy/Caddyfile')
snippet = (Path(__file__).parent / 'Caddyfile.snippet').read_text().strip()
original = target.read_text()
start, end = '# >>> accounting-sim', '# <<< accounting-sim'
if (start in original) != (end in original):
    raise SystemExit('Incomplete AccountingSim markers; shared Caddyfile left untouched.')
if start in original:
    first, last = original.index(start), original.index(end) + len(end)
    updated = original[:first] + snippet + original[last:]
elif 'accounting.tryzarqa.com' in original:
    raise SystemExit('Unmanaged AccountingSim route exists; shared Caddyfile left untouched.')
else:
    updated = original.rstrip() + '\n\n' + snippet + '\n'

backup = target.with_name('Caddyfile.bak-accounting-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
if updated != original:
    shutil.copy2(target, backup)
    # Keep the inode: the running proxy bind-mounts this exact file.
    target.write_text(updated)
container_config = '/tmp/accounting-shared-Caddyfile'

def reload_config(validate=True):
    # Another deployment may have replaced the host file's inode since this
    # proxy started, leaving its /etc bind mount on an older copy. Load the
    # actual current host config explicitly, without restarting other apps.
    subprocess.run(['docker', 'cp', str(target), f'zarqa-caddy-1:{container_config}'], check=True)
    if validate:
        subprocess.run(['docker', 'exec', 'zarqa-caddy-1', 'caddy', 'validate', '--config', container_config, '--adapter', 'caddyfile'], check=True)
    subprocess.run(['docker', 'exec', 'zarqa-caddy-1', 'caddy', 'reload', '--config', container_config, '--adapter', 'caddyfile'], check=True)

try:
    reload_config()
except subprocess.CalledProcessError:
    target.write_text(original)
    reload_config(validate=False)
    raise
print('AccountingSim route validated and loaded; existing routes preserved.')

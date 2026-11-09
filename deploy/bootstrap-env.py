"""Run on the VPS to prepare AccountingSim's private settings without printing secrets."""
from pathlib import Path
import os
import secrets

def read_env(path):
    if not path.exists():
        return {}
    return dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line and not line.startswith('#'))

root = Path(__file__).resolve().parent.parent
target = root / '.env'
if target.exists():
    raise SystemExit('Existing .env preserved; edit it explicitly to change settings.')
drivealt = read_env(Path.home() / 'drivealt/.env')
zarqa = read_env(Path('/opt/zarqa/deploy/.env'))
deepseek = drivealt.get('DeepSeek__ApiKey')
resend = drivealt.get('Resend__ApiKey') or zarqa.get('RESEND_API_KEY')
if not deepseek or not resend:
    raise SystemExit('Required shared DeepSeek/Resend setting is missing; no .env written.')
settings = {
    'APP_URL': 'https://accounting.tryzarqa.com',
    'DOMAIN': 'accounting.tryzarqa.com',
    'SESSION_SECRET': secrets.token_hex(32),
    'POSTGRES_PASSWORD': secrets.token_hex(32),
    'TEACHER_EMAILS': 'aliya.albalushi@gutech.edu.om,asnssrr@gmail.com,dark99mam@gmail.com,rawahi.s96@gmail.com',
    'STUDENT_EMAIL_DOMAIN': 'student.gutech.edu.om',
    'DEEPSEEK_API_KEY': deepseek,
    'DEEPSEEK_MODEL': drivealt.get('DeepSeek__Model') or 'deepseek-chat',
    'RESEND_API_KEY': resend,
    'MAIL_FROM': 'AccountingSim <noreply@tryzarqa.com>',
    'DEV_OTP_BYPASS': 'false',
}
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write(''.join(f'{key}={value}\n' for key, value in settings.items()))
print('Private AccountingSim environment created; DeepSeek and Resend configured.')

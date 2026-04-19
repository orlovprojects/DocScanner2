import logging
import requests
from django.conf import settings
from celery.signals import task_failure, task_success, task_prerun

logger = logging.getLogger("celery_beat_monitor")

# Redis для дедупликации алертов (опционально, если не доступен — работаем без)
try:
    from django.core.cache import cache as _cache
except Exception:
    _cache = None

MONITORED_TASKS = {
    "process_recurring_invoices",
    "send_payment_reminders",
    "docscanner_app.tasks.fetch_daily_currency_rates",
    "docscanner_app.tasks.fallback_poll_all",
    "docscanner_app.tasks.renew_gdrive_watches",
    "docscanner_app.tasks.monitor_stuck_sessions",
}


def _send_telegram(message, dedup_key=None, dedup_ttl=300):
    """
    Отправка сообщения в Telegram.
    
    dedup_key: если указан, не шлёт повторно тот же ключ в течение dedup_ttl секунд.
                Защита от спама при массовых ошибках (например, quota exhausted).
    dedup_ttl: TTL дедупликации в секундах (default 300 = 5 минут).
    """
    if dedup_key and _cache is not None:
        try:
            cache_key = f"tg_dedup:{dedup_key}"
            # cache.add вернёт False если ключ уже существует
            if not _cache.add(cache_key, "1", timeout=dedup_ttl):
                return  # уже отправляли недавно — скип
        except Exception:
            pass  # если cache недоступен — шлём как обычно

    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    chat_id = getattr(settings, "TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
            timeout=10,
        )
    except Exception:
        pass


@task_prerun.connect
def on_task_prerun(sender=None, task_id=None, **kwargs):
    task_name = sender.name if sender else "unknown"
    if task_name in MONITORED_TASKS:
        logger.info("STARTED: %s (id=%s)", task_name, task_id)


@task_success.connect
def on_task_success(sender=None, result=None, **kwargs):
    task_name = sender.name if sender else "unknown"
    if task_name not in MONITORED_TASKS:
        return
    if isinstance(result, dict):
        details = ", ".join(f"{k}={v}" for k, v in result.items())
    else:
        details = str(result)
    logger.info("SUCCESS: %s | %s", task_name, details)
    if getattr(settings, "TELEGRAM_NOTIFY_SUCCESS", False):
        _send_telegram(f"✅ <b>{task_name}</b>\n{details}")


@task_failure.connect
def on_task_failure(sender=None, task_id=None, exception=None, traceback=None, **kwargs):
    task_name = sender.name if sender else "unknown"
    logger.error("FAILED: %s | %s", task_name, str(exception)[:1000])
    _send_telegram(
        f"🔴 <b>Task failed</b>\n"
        f"<b>Task:</b> {task_name}\n"
        f"<b>Error:</b> {str(exception)[:500]}"
    )
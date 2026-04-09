"""
python manage.py fix_stuck_session --push <session_id> --fail <session_id> <session_id>
"""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from docscanner_app.models import UploadSession, ScannedDocument, CustomUser
from docscanner_app.tasks import process_uploaded_file_task


class Command(BaseCommand):
    help = "Push or fail stuck upload sessions"

    def add_arguments(self, parser):
        parser.add_argument("--push", type=str, help="Session ID to push to processing")
        parser.add_argument("--fail", nargs="*", type=str, help="Session IDs to fail")
        parser.add_argument("--fail-msg", type=str, default="Pakartotina sesija")

    def handle(self, *args, **options):
        if options["push"]:
            self._push(options["push"])
        if options["fail"]:
            for sid in options["fail"]:
                self._fail(sid, options["fail_msg"])

    def _push(self, sid):
        s = UploadSession.objects.get(id__startswith=sid)
        docs = ScannedDocument.objects.filter(
            upload_session=s, status__in=["pending", "processing"]
        )
        doc_count = docs.count()
        if doc_count == 0:
            self.stdout.write(f"No pending docs for {sid}")
            return

        with transaction.atomic():
            u = CustomUser.objects.select_for_update().get(id=s.user_id)
            cost = Decimal(doc_count)
            u.credits_reserved += cost
            u.save(update_fields=["credits_reserved"])
            s.reserved_credits = cost
            s.actual_items = doc_count
            s.stage = "processing"
            s.save(update_fields=["stage", "actual_items", "reserved_credits", "updated_at"])

        for d in docs:
            process_uploaded_file_task.delay(d.user_id, d.id, s.scan_type)

        self.stdout.write(f"Pushed {doc_count} docs from {str(s.id)[:8]}, user {s.user_id}")

    def _fail(self, sid, msg):
        s = UploadSession.objects.get(id__startswith=sid)
        failed_docs = ScannedDocument.objects.filter(upload_session=s).update(
            status="rejected", error_message=msg
        )
        s.stage = "failed"
        s.save(update_fields=["stage", "updated_at"])
        self.stdout.write(f"Failed session {str(s.id)[:8]}, {failed_docs} docs marked rejected")

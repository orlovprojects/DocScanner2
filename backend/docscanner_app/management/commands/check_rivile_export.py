"""
Management command: проверяет результаты экспорта Rivile GAMA API.

Использование:
    python manage.py check_rivile_export
    python manage.py check_rivile_export --limit 20
    python manage.py check_rivile_export --session 5
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Patikrina Rivile GAMA API eksporto rezultatus"

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit", type=int, default=10,
            help="Max records to show per section (default: 10)",
        )
        parser.add_argument(
            "--session", type=int, default=None,
            help="Filter by ExportSession id",
        )

    def handle(self, *args, **options):
        from docscanner_app.models import (
            ExportSession, APIExportLog, APIExportArticleLog,
            ScannedDocument, RivileAPIRefLog,
        )

        limit = options["limit"]
        session_filter = options["session"]

        W = 65

        # ═══ 1. ExportSession ═══
        self.stdout.write("\n" + "=" * W)
        self.stdout.write("  1. EXPORT SESSIONS (rivile_gama_api)")
        self.stdout.write("=" * W)

        qs = ExportSession.objects.filter(program="rivile_gama_api")
        if session_filter:
            qs = qs.filter(pk=session_filter)
        sessions = qs.order_by("-created_at")[:limit]

        if not sessions:
            self.stdout.write(self.style.WARNING("  (nėra sesijų)"))
        for s in sessions:
            time_str = ""
            if s.total_time_seconds is not None:
                time_str = f" time={s.total_time_seconds:.1f}s"

            color = (
                self.style.SUCCESS if s.stage == "done" and s.error_count == 0
                else self.style.WARNING if s.stage == "done"
                else self.style.NOTICE
            )
            self.stdout.write(color(
                f"  id={s.pk}  stage={s.stage}  docs={s.total_documents}  "
                f"processed={s.processed_documents}  "
                f"ok={s.success_count}  partial={s.partial_count}  "
                f"err={s.error_count}{time_str}"
            ))
            if s.task_id:
                self.stdout.write(f"    task_id: {s.task_id}")

        # ═══ 2. APIExportLog ═══
        self.stdout.write("\n" + "=" * W)
        self.stdout.write("  2. API EXPORT LOGS (rivile_gama_api)")
        self.stdout.write("=" * W)

        log_qs = APIExportLog.objects.filter(program="rivile_gama_api")
        if session_filter:
            log_qs = log_qs.filter(session_id=session_filter)
        logs = log_qs.order_by("-created_at")[:limit]

        if not logs:
            self.stdout.write(self.style.WARNING("  (nėra logų)"))
        for l in logs:
            arts = l.article_logs.count()
            status_color = (
                self.style.SUCCESS if l.status == "success"
                else self.style.WARNING if l.status == "partial_success"
                else self.style.ERROR
            )
            self.stdout.write(status_color(
                f"  doc={l.document_id}  status={l.status}  "
                f"inv={l.invoice_status}  partner={l.partner_status or '—'}  "
                f"articles={arts}  session={l.session_id or '—'}"
            ))
            if l.invoice_error:
                self.stdout.write(self.style.ERROR(
                    f"    inv_error: {l.invoice_error[:120]}"
                ))
            if l.partner_error:
                self.stdout.write(self.style.ERROR(
                    f"    partner_error: {l.partner_error[:120]}"
                ))

        # ═══ 3. APIExportArticleLog ═══
        self.stdout.write("\n" + "=" * W)
        self.stdout.write("  3. ARTICLE LOGS (N17 + N25)")
        self.stdout.write("=" * W)

        if logs:
            first_log = logs[0]
            articles = first_log.article_logs.all()[:limit]
            if not articles:
                self.stdout.write(self.style.WARNING(
                    f"  (nėra article logs for export_log={first_log.pk})"
                ))
            for a in articles:
                color = (
                    self.style.SUCCESS if a.status in ("Success", "Duplicate")
                    else self.style.ERROR
                )
                self.stdout.write(color(
                    f"  method={a.article_name:<12}  code={a.article_code:<20}  "
                    f"status={a.status}"
                ))
                if a.error:
                    self.stdout.write(self.style.ERROR(
                        f"    error: {a.error[:100]}"
                    ))
        else:
            self.stdout.write(self.style.WARNING("  (nėra logų — nėra article logs)"))

        # ═══ 4. ScannedDocument — rivile поля ═══
        self.stdout.write("\n" + "=" * W)
        self.stdout.write("  4. SCANNED DOCUMENTS (rivile fields)")
        self.stdout.write("=" * W)

        if logs:
            doc_ids = list(set(l.document_id for l in logs[:limit]))
            docs = ScannedDocument.objects.filter(pk__in=doc_ids)
            for d in docs:
                status_str = d.rivile_api_status or "—"
                color = (
                    self.style.SUCCESS if status_str == "success"
                    else self.style.WARNING if status_str == "partial_success"
                    else self.style.ERROR if status_str == "error"
                    else self.style.NOTICE
                )
                last_try = (
                    d.rivile_api_last_try.strftime("%Y-%m-%d %H:%M:%S")
                    if d.rivile_api_last_try else "—"
                )
                self.stdout.write(color(
                    f"  id={d.pk}  doc_status={d.status}  "
                    f"rivile_api={status_str}  "
                    f"last_try={last_try}  "
                    f"kodas_po={d.rivile_api_kodas_po or '—'}"
                ))
        else:
            self.stdout.write(self.style.WARNING("  (nėra logų — nėra dokumentų)"))

        # ═══ 5. RivileAPIRefLog ═══
        self.stdout.write("\n" + "=" * W)
        self.stdout.write("  5. RIVILE REF LOGS (N08/N17/N25)")
        self.stdout.write("=" * W)

        ref_qs = RivileAPIRefLog.objects.all()
        if session_filter:
            # session в RefLog — строка, а не FK
            # Берём session_id из ExportSession
            if sessions:
                # RefLog.session = строковый session_id из RivileExportSession, не pk
                # Фильтруем по времени создания сессии
                pass
        refs = ref_qs.order_by("-created_at")[:limit]

        if not refs:
            self.stdout.write(self.style.WARNING("  (nėra ref logų)"))
        for r in refs:
            color = (
                self.style.SUCCESS if r.status == "Success"
                else self.style.WARNING if r.status == "Duplicate"
                else self.style.ERROR
            )
            self.stdout.write(color(
                f"  {r.method:<16}  entity={r.entity_code:<20}  "
                f"status={r.status:<10}  http={r.http_status}"
            ))
            if r.error_message:
                self.stdout.write(self.style.ERROR(
                    f"    error: {r.error_message[:100]}"
                ))

        # ═══ Summary ═══
        self.stdout.write("\n" + "=" * W)
        self.stdout.write("  SUMMARY")
        self.stdout.write("=" * W)

        total_sessions = ExportSession.objects.filter(program="rivile_gama_api").count()
        total_logs = APIExportLog.objects.filter(program="rivile_gama_api").count()
        total_refs = RivileAPIRefLog.objects.count()

        success_docs = APIExportLog.objects.filter(
            program="rivile_gama_api", status="success"
        ).count()
        partial_docs = APIExportLog.objects.filter(
            program="rivile_gama_api", status="partial_success"
        ).count()
        error_docs = APIExportLog.objects.filter(
            program="rivile_gama_api", status="error"
        ).count()

        exported_count = ScannedDocument.objects.filter(
            rivile_api_status__in=["success", "partial_success"]
        ).count()

        self.stdout.write(f"  Sessions:     {total_sessions}")
        self.stdout.write(f"  Export logs:  {total_logs} "
                          f"(ok={success_docs} partial={partial_docs} err={error_docs})")
        self.stdout.write(f"  Ref logs:     {total_refs}")
        self.stdout.write(f"  Docs with rivile_api_status success/partial: {exported_count}")
        self.stdout.write("=" * W + "\n")
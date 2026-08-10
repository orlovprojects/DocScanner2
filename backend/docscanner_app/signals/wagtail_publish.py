from django.db import transaction
from django.dispatch import receiver
from wagtail.signals import page_published, page_unpublished

from docscanner_app.models import (
    BlogPostPage, BlogCategoryPage, GuidePage, GuideCategoryPage,
)
from docscanner_app.tasks import prerender_route_task, remove_prerender_task


def frontend_url_for(page):
    p = page.specific
    if isinstance(p, BlogPostPage):
        return f"/tinklarastis/{p.slug}"
    if isinstance(p, BlogCategoryPage):
        return f"/tinklarastis/tema/{p.slug}"
    if isinstance(p, GuidePage):
        return f"/straipsnis/{p.slug}"
    if isinstance(p, GuideCategoryPage):
        return f"/kategorija/{p.slug}"
    return None


@receiver(page_published)
def on_page_published(sender, instance, **kwargs):
    url = frontend_url_for(instance)
    if url:
        transaction.on_commit(lambda: prerender_route_task.delay(url))


@receiver(page_unpublished)
def on_page_unpublished(sender, instance, **kwargs):
    url = frontend_url_for(instance)
    if url:
        transaction.on_commit(lambda: remove_prerender_task.delay(url))
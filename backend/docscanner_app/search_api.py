from django.db.models import F, Q, Value
from django.db.models.functions import Lower
from django.db.models.expressions import Func
from django.contrib.postgres.search import TrigramSimilarity
from django.utils.html import strip_tags

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from docscanner_app.models import GuideCategoryPage, GuidePage
from docscanner_app.serializers import rendition_url  # твой helper из сериализаторов


# -- helper: использовать нашу IMMUTABLE-обёртку в SQL
class UnaccentImmutable(Func):
    function = "public.unaccent_immutable"
    arity = 1


def norm_expr(field_name: str):
    """unaccent_immutable(lower(field))"""
    return UnaccentImmutable(Lower(F(field_name)))


class GuidesSmartSearchView(APIView):
    """
    GET /guides-api/v2/search/?q=tekstas&limit=5
    Смешанные результаты: категории + статьи. До `limit` штук.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        q = (request.GET.get("q") or "").strip()
        limit = max(1, int(request.GET.get("limit", 5)))
        if not q:
            return Response({"results": []})

        q_norm = q.lower()

        # --- Категории
        cats_qs = (
            GuideCategoryPage.objects.live().public()
            .annotate(sim=TrigramSimilarity(norm_expr("search_text"), Value(q_norm)))
            .filter(Q(search_text__icontains=q_norm) | Q(sim__gt=0.1))
            .values("id", "slug", "title", "description", "sim")
        )

        cat_results = []
        # небольшой запас перед сортировкой
        for c in cats_qs[:limit * 3]:
            # аккуратно достанем картинку (можно оптимизировать select_related, но у Page FK к images без прямой связи)
            obj = GuideCategoryPage.objects.only("cat_image").get(id=c["id"])
            cat_results.append({
                "type": "category",
                "id": c["id"],
                "title": c["title"],
                "snippet": (strip_tags(c.get("description") or "")[:180]),
                "image_url": rendition_url(getattr(obj, "cat_image", None)),
                "href": f"/kategorija/{c['slug']}",
                "score": float(c.get("sim") or 0.0) + 0.05,  # слегка бустим категории
            })

        # --- Статьи
        guides_qs = (
            GuidePage.objects.live().public()
            .annotate(sim=TrigramSimilarity(norm_expr("search_text"), Value(q_norm)))
            .filter(Q(search_text__icontains=q_norm) | Q(sim__gt=0.1))
            .values("id", "slug", "title", "sim")
        )

        guide_results = []
        guide_ids = [g["id"] for g in guides_qs[:limit * 3]]
        # вытащим заранее поля для сниппета и картинки
        st_map = dict(GuidePage.objects.filter(id__in=guide_ids).values_list("id", "search_text"))
        img_lookup = {obj.id: getattr(obj, "main_image", None)
                      for obj in GuidePage.objects.only("id", "main_image").filter(id__in=guide_ids)}

        for g in guides_qs[:limit * 3]:
            st = (st_map.get(g["id"]) or "").replace("\n", " ").strip()
            guide_results.append({
                "type": "article",
                "id": g["id"],
                "title": g["title"],
                "snippet": st[:180],
                "image_url": rendition_url(img_lookup.get(g["id"])),
                "href": f"/gidas/{g['slug']}",
                "score": float(g.get("sim") or 0.0),
            })

        # --- Смешиваем и сортируем по релевантности
        combined = cat_results + guide_results
        combined.sort(key=lambda x: (-x["score"], x["title"]))
        return Response({"results": combined[:limit]})
from rest_framework.pagination import CursorPagination

class DocumentsCursorPagination(CursorPagination):
    page_size = 50
    ordering = "-uploaded_at"
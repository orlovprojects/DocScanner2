from wagtail import blocks


class DownloadButtonBlock(blocks.StructBlock):
    label = blocks.CharBlock(required=True, default="Atsisiųsti", label="Mygtuko tekstas")
    file_url = blocks.CharBlock(
        required=True,
        label="Failo kelias arba URL",
        help_text="Pvz.: /media/sablonai/saskaita.xlsx",
    )

    class Meta:
        icon = "download"
        label = "Atsisiuntimo mygtukas"
from unittest import TestCase

from docscanner_app.payroll.form_versions import newer_versions


class FormVersionsTests(TestCase):

    def test_detect_new(self):
        html = '<a href="/uploads/sam-v07.mxfd">x</a><a href="/uploads/SAM-v08.zip">y</a><a href="1-sd-v11.zip">z</a>'
        self.assertEqual(newer_versions(html), {"sam": 8})

    def test_no_false_match(self):
        # "12-sd" neturi būti palaikytas "2-sd"
        self.assertEqual(newer_versions('<a href="12-sd-v05.zip">'), {})

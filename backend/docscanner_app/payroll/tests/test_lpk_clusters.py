from unittest import TestCase

from docscanner_app.payroll.lpk import cluster_for, scores_differ


class LpkClusterTests(TestCase):

    def test_cluster_lookup(self):
        a, b = cluster_for("241101"), cluster_for("241102")          # buhalteris / auditorius - skirtingi klasteriai
        self.assertNotEqual(a["key"], b["key"])
        self.assertTrue(a["exact"])
        self.assertFalse(cluster_for("2411")["exact"])                # tik 4 skaitmenys, grupė nevienalytė
        self.assertEqual(cluster_for("251201")["key"], cluster_for("251202")["key"])   # programuotojai - viena grupė
        self.assertIsNone(cluster_for(""))

    def test_scores_differ(self):
        base = dict(skills=3, qualification=3, effort=3, responsibility=3, conditions=3)
        self.assertFalse(scores_differ(base, dict(base, skills=4)))
        self.assertTrue(scores_differ(base, dict(base, responsibility=5)))

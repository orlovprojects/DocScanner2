from datetime import date
from decimal import Decimal as D
from unittest import TestCase

from docscanner_app.payroll.roster.rulecheck import check_rules, plan_hints
from docscanner_app.payroll.roster.solver import Rule

d1, d2 = date(2026, 11, 2), date(2026, 11, 3)


class RuleCheckTests(TestCase):

    def test_plan_and_rules(self):
        rules = [Rule(1, "never_shifts", {1}, params={"shifts": [2]}, label="1 be naktų"),
                 Rule(2, "never_together", {1}, {2}, label="1 ne su 2")]
        a = [(1, d1, 2), (1, d2, 1), (2, d2, 1)]
        slots = {(d1, 1): (1, 2), (d2, 1): (2, 2)}
        v = check_rules(a, [1, 2], rules, slots)
        msgs = [x["message"] for x in v]
        self.assertTrue(any("plane nėra" in m for m in msgs))          # naktis d1 ne plane
        self.assertTrue(any("Trūksta 1" in m for m in msgs))           # d1 diena tuščia
        self.assertEqual({x["rule_id"] for x in v if x["rule_id"]}, {1, 2})

    def test_hints(self):
        slots = {(d1, 2): (2, 2)}
        rules = [Rule(1, "never_shifts", {1, 2}, params={"shifts": [2]}, label="be naktų")]
        h = plan_hints(slots, {2: D("12")}, [(1, "A", D("24")), (2, "B", D("24")), (3, "C", D("24"))], rules, [1, 2])
        self.assertTrue(any("trūksta laisvų" in x["message"] for x in h))
        self.assertTrue(any("trūksta ~48" in x["message"] for x in h))

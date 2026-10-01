"""
DU parametrai pagal datą.

TaxParams - nekintamas parametrų rinkinys konkrečiai datai.
Skaičiavimo moduliai (taxes.py ir kt.) gauna TaxParams ir neina į DB patys.
"""
import logging
from dataclasses import dataclass, field, fields
from datetime import date
from decimal import Decimal

logger = logging.getLogger("docscanner_app")


@dataclass(frozen=True)
class TaxParams:
    on_date: date

    mma: Decimal
    mva: Decimal
    vdu: Decimal

    npd_max: Decimal
    npd_coef: Decimal
    npd_30_55: Decimal
    npd_0_25: Decimal

    gpm_rate_1: Decimal
    gpm_rate_2: Decimal
    gpm_rate_3: Decimal
    gpm_threshold_1_vdu: Decimal
    gpm_threshold_2_vdu: Decimal
    gpm_sick: Decimal

    vsd_emp: Decimal
    psd_emp: Decimal
    kaupimas: Decimal
    vsd_cap_vdu: Decimal

    empl_unemp: Decimal
    empl_unemp_term: Decimal
    gar: Decimal
    ilg: Decimal

    sick_min_pct: Decimal
    dpn_threshold_mma: Decimal
    dov_limit: Decimal
    svd_limit: Decimal
    benefits_pct: Decimal
    aid_sodra_mma: Decimal
    car_pct_fuel: Decimal
    car_pct_nofuel: Decimal

    # raktai, kurių reikšmė dar laikina (pvz. VDU 2027 iki gruodžio)
    preliminary_keys: frozenset = field(default_factory=frozenset)

    # --- išvestinės reikšmės ---
    @property
    def employee_sodra_rate(self):
        """Darbuotojo Sodra be kaupimo: 19,5 %."""
        return self.vsd_emp + self.psd_emp

    @property
    def vsd_cap_amount(self):
        """Metinės VSD lubos EUR (60 VDU)."""
        return self.vsd_cap_vdu * self.vdu

    @property
    def gpm_threshold_1_amount(self):
        return self.gpm_threshold_1_vdu * self.vdu

    @property
    def gpm_threshold_2_amount(self):
        return self.gpm_threshold_2_vdu * self.vdu

    @property
    def has_preliminary(self):
        return bool(self.preliminary_keys)


_PARAM_FIELDS = [f.name for f in fields(TaxParams) if f.name not in ("on_date", "preliminary_keys")]


def _build(on_date, rows):
    """
    rows: iterable (key, value, valid_from, valid_to, is_preliminary)
    Kiekvienam raktui imama eilutė, galiojanti on_date, su vėliausiu valid_from.
    """
    best = {}
    for key, value, valid_from, valid_to, is_prelim in rows:
        if valid_from > on_date:
            continue
        if valid_to is not None and valid_to < on_date:
            continue
        cur = best.get(key)
        if cur is None or valid_from > cur[1]:
            best[key] = (Decimal(value), valid_from, is_prelim)

    missing = [name for name in _PARAM_FIELDS if name.upper() not in best]
    if missing:
        raise ValueError(f"DU parametrai {on_date}: trūksta {', '.join(sorted(missing))}")

    values = {name: best[name.upper()][0] for name in _PARAM_FIELDS}
    prelim = frozenset(k for k, v in best.items() if v[2])
    return TaxParams(on_date=on_date, preliminary_keys=prelim, **values)


def params_from_seed(on_date):
    """Parametrai iš seed_data (testams ir pradiniam užpildymui, be DB)."""
    from .seed_data import PARAMETERS
    rows = [(k, v, vf, vt, pre) for k, v, vf, vt, pre, _src in PARAMETERS]
    return _build(on_date, rows)


def get_params(on_date):
    """Parametrai iš DB (PayrollParameter) konkrečiai datai."""
    from docscanner_app.models import PayrollParameter

    rows = PayrollParameter.objects.filter(valid_from__lte=on_date).values_list(
        "key", "value", "valid_from", "valid_to", "is_preliminary"
    )
    params = _build(on_date, rows)
    if params.has_preliminary:
        logger.warning("DU parametrai %s: laikinos reikšmės %s", on_date, sorted(params.preliminary_keys))
    return params

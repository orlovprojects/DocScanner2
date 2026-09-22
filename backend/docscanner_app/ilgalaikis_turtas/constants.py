from django.db import models


class FixedAssetCategory(models.TextChoices):
    COMPUTER_EQUIPMENT = "kompiuterinė technika", "Kompiuterinė technika"
    COMMUNICATION_EQUIPMENT = "ryšių priemonės", "Ryšių priemonės"
    SOFTWARE = "programinė įranga", "Programinė įranga"
    ACQUIRED_RIGHTS = "įsigytos teisės", "Įsigytos teisės"
    FURNITURE = "baldai", "Baldai"
    PASSENGER_CAR = "lengvasis automobilis", "Lengvasis automobilis"
    TRUCK = "krovininis automobilis", "Krovininis automobilis"
    MACHINERY = "mašinos ir įrengimai", "Mašinos ir įrengimai"
    EQUIPMENT = "įrenginiai", "Įrenginiai"
    INVENTORY = "inventorius", "Inventorius"
    OTHER_TANGIBLE = "kitas materialusis turtas", "Kitas materialusis turtas"
    OTHER_INTANGIBLE = "kitas nematerialusis turtas", "Kitas nematerialusis turtas"


ILT_MONTHS = {
    FixedAssetCategory.COMPUTER_EQUIPMENT: 36,
    FixedAssetCategory.COMMUNICATION_EQUIPMENT: 36,
    FixedAssetCategory.SOFTWARE: 36,
    FixedAssetCategory.ACQUIRED_RIGHTS: 36,
    FixedAssetCategory.FURNITURE: 72,
    FixedAssetCategory.PASSENGER_CAR: 72,
    FixedAssetCategory.TRUCK: 48,
    FixedAssetCategory.MACHINERY: 60,
    FixedAssetCategory.EQUIPMENT: 96,
    FixedAssetCategory.INVENTORY: 72,
    FixedAssetCategory.OTHER_TANGIBLE: 48,
    FixedAssetCategory.OTHER_INTANGIBLE: 48,
}


class FixedAssetStatus(models.TextChoices):
    DRAFT = "draft", "Juodraštis"
    ACTIVE = "active", "Eksploatuojamas"
    SOLD = "sold", "Parduotas"
    WRITTEN_OFF = "written_off", "Nurašytas"


class FixedAssetOperationType(models.TextChoices):
    ACQUISITION = "acquisition", "Įsigijimas"
    DEPRECIATION = "depreciation", "Nusidėvėjimas"
    IMPROVEMENT = "improvement", "Pagerinimas"
    IMPAIRMENT = "impairment", "Vertės sumažėjimas"
    REVALUATION = "revaluation", "Perkainojimas"
    SALE = "sale", "Pardavimas"
    WRITE_OFF = "write_off", "Nurašymas"
    ADJUSTMENT = "adjustment", "Koregavimas"


class DepreciationBook(models.TextChoices):
    ACCOUNTING = "accounting", "Buhalterinis"
    TAX = "tax", "Mokestinis"


# (turto savikaina, sukauptas nusidėvėjimas/amortizacija, nusidėvėjimo sąnaudos)
DEFAULT_GROUP_ACCOUNTS = {
    FixedAssetCategory.COMPUTER_EQUIPMENT: ("1240", "1247", "6306"),
    FixedAssetCategory.COMMUNICATION_EQUIPMENT: ("1240", "1247", "6306"),
    FixedAssetCategory.SOFTWARE: ("1130", "1138", "6307"),
    FixedAssetCategory.ACQUIRED_RIGHTS: ("1140", "1148", "6307"),
    FixedAssetCategory.FURNITURE: ("1240", "1247", "6306"),
    FixedAssetCategory.PASSENGER_CAR: ("1230", "1237", "6306"),
    FixedAssetCategory.TRUCK: ("1230", "1237", "6306"),
    FixedAssetCategory.MACHINERY: ("1220", "1227", "6306"),
    FixedAssetCategory.EQUIPMENT: ("1220", "1227", "6306"),
    FixedAssetCategory.INVENTORY: ("1240", "1247", "6306"),
    FixedAssetCategory.OTHER_TANGIBLE: ("1240", "1247", "6306"),
    FixedAssetCategory.OTHER_INTANGIBLE: ("1150", "1158", "6307"),
}


class DepreciationStartRule(models.TextChoices):
    NEXT_MONTH = "next_month", "Nuo kito mėnesio pirmos dienos"
    SAME_MONTH = "same_month", "Nuo to paties mėnesio"


DEFAULT_DEPRECIATION_START_RULE = DepreciationStartRule.NEXT_MONTH



WRITE_OFF_LOSS_ACCOUNT = "6400"


class WriteOffReason(models.TextChoices):
    BROKEN = "sugedo", "Sugedo"
    DESTROYED = "sunaikintas", "Sunaikintas"
    LOST = "prarastas", "Prarastas"
    UNUSABLE = "netinkamas", "Netinkamas naudoti"
    OTHER = "kita", "Kita"


SALE_GAIN_ACCOUNT = "5400"
SALE_LOSS_ACCOUNT = "6400"


INVENTORY_NUMBER_PREFIX = "IT-"
INVENTORY_NUMBER_DIGITS = 6
MAX_SPLIT_COUNT = 500
NUS_DOCUMENT_PREFIX = "NUS-"

OPENING_REASON = "pradiniai_likuciai"
CONTROL_ACCOUNT_PREFIXES = ("2080", "2410", "4420", "4430")

# Leidžiamos kredito sąskaitos rankiniu būdu kuriamam turtui
MANUAL_CREDIT_ACCOUNTS = ("308", "3011", "401", "272", "4494", "5401", "2010", "2040")


class ManualAssetSource(models.TextChoices):
    OPENING = "opening", "Pradiniai likučiai"
    OTHER = "other", "Kita"
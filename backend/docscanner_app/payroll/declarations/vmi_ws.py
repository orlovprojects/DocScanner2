"""
VMI EDS žiniatinklio paslauga (EDSWebServiceUploadFile, SOAP 1.1).
  SubmitFile      - pateikti .ffdata (failas lieka NEPATVIRTINTAS - patvirtinti EDS portale per nurodytą terminą)
  CheckFileState  - failo ir deklaracijos būsena
Ribojimai: 200 failų per parą; po kelių blogų slaptažodžių naudotojas laikinai blokuojamas.
"""
import base64
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from xml.sax.saxutils import escape

import requests

URL = "https://deklaravimas.vmi.lt/EDSWebServiceUploadFile/EDSWebServiceUploadFile.asmx"
NS = "http://vmi.lt/EDSUploadFile.wsdl"
APP_NAME = "DokSkenas"
AUTH_ERRORS = {"101_AUTHENTICATION_FAIL", "102_AUTHENTICATION_FAIL_USER_BLOCKED", "103_AUTHENTICATION_FAIL_BAD_PASSWORD",
               "104_AUTHENTICATION_FAIL_WS_OFF", "105_AUTHENTICATION_FAIL_EXPIRED", "603_AUTHENTICATION_FAIL",
               "604_AUTHENTICATION_FAIL_USER_BLOCKED", "605_AUTHENTICATION_FAIL_BAD_PASSWORD",
               "606_AUTHENTICATION_FAIL_EXPIRED", "607_AUTHENTICATION_FAIL_WS_OFF", "609_NEED_CHANGE_PASSWORD",
               "302_BAD_PERSON_LEGAL_CODE", "611_BAD_PERSON_LEGAL_CODE"}

FILE_STATES = {10: "Patvirtintas", 20: "Nepatvirtintas", 30: "Pašalintas", 40: "Nebetvirtinamas"}
DECL_STATES = {9: "Pateikta - laukia kitų dekl. patikrinimo", 10: "Pateikta", 21: "Priimta", 22: "Priimta su klaidomis",
               41: "Sulaikyta dėl AS atšaukimo", 100: "Anuliuota", 101: "Nepriimta", 102: "Atmesta",
               103: "Atmesta dėl tikrinimo", 115: "Pateikta*"}
DECL_ACCEPTED = {21, 22}
DECL_REJECTED = {100, 101, 102, 103}


class VmiError(Exception):
    def __init__(self, code, message):
        super().__init__(f"{code}: {message}")
        self.code, self.message = code, message

    @property
    def is_auth(self):
        return self.code in AUTH_ERRORS


@dataclass
class FileState:
    file_state: int = None
    file_state_name: str = ""
    confirmed_by: str = ""
    decl_state: int = None
    decl_state_name: str = ""
    decl_state_date: str = ""


def _envelope(op, fields):
    body = "".join(f"<{k}>{escape(str(v))}</{k}>" for k, v in fields.items())
    return ('<?xml version="1.0" encoding="utf-8"?>'
            '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
            f'<soap:Body><{op} xmlns="{NS}">{body}</{op}></soap:Body></soap:Envelope>').encode("utf-8")


def _call(op, fields, timeout=60):
    r = requests.post(URL, data=_envelope(op, fields), timeout=timeout, headers={
        "Content-Type": "text/xml; charset=utf-8", "SOAPAction": f'"{NS}/{op}"'})
    if r.status_code >= 500 and b"Fault" not in r.content:
        r.raise_for_status()
    return r.content


def _find(root, path):
    el = root.find(path.replace("t:", f"{{{NS}}}"))
    return el.text if el is not None and el.text is not None else ""


def parse_submit(xml_bytes):
    root = ET.fromstring(xml_bytes)
    ok = _find(root, ".//t:SubmitFileResult/t:Result").lower() == "true"
    code, msg = _find(root, ".//t:SubmitFileResult/t:ErrorCode"), _find(root, ".//t:SubmitFileResult/t:Message")
    if not ok:
        raise VmiError(code or "000_ERROR", msg or "Nežinoma VMI klaida")
    return _find(root, ".//t:SubmitFileResult/t:FileId"), msg


def parse_state(xml_bytes):
    root = ET.fromstring(xml_bytes)
    p = ".//t:CheckFileStateResult/"
    if _find(root, p + "t:Result").lower() != "true":
        raise VmiError(_find(root, p + "t:ErrorCode") or "600_ERROR", _find(root, p + "t:Message"))

    def num(v):
        return int(v) if v.strip().lstrip("-").isdigit() else None

    fs = num(_find(root, p + "t:FileStateData/t:FileConfirmStateCode"))
    ds = num(_find(root, p + "t:DeclatationStateData/t:DeclarationStateCode"))
    return FileState(
        file_state=fs, file_state_name=_find(root, p + "t:FileStateData/t:FileStateName") or FILE_STATES.get(fs, ""),
        confirmed_by=_find(root, p + "t:FileStateData/t:UserConfirmedName"),
        decl_state=ds, decl_state_name=_find(root, p + "t:DeclatationStateData/t:DeclarationStateName") or DECL_STATES.get(ds, ""),
        decl_state_date=_find(root, p + "t:DeclatationStateData/t:DeclatationStateDate"),
    )


def submit_file(content, file_name, username, password, person_code, description=""):
    """-> (FileId, pranešimas su patvirtinimo terminu). Klaida -> VmiError."""
    return parse_submit(_call("SubmitFile", {
        "File": base64.b64encode(content).decode(), "FileName": file_name, "FileDescription": description[:150],
        "AppName": APP_NAME, "UserName": username, "Password": password, "PersonCode": person_code,
    }))


def check_file_state(file_id, username, password):
    return parse_state(_call("CheckFileState", {
        "FileId": file_id, "AppName": APP_NAME, "UserName": username, "Password": password}))


def test_connection(username, password):
    """Prisijungimo patikra: neegzistuojantis failas -> 612_NO_FILE_FOUND reiškia, kad prisijungimas geras."""
    try:
        check_file_state("00000000-0000-0000-0000-000000000000", username, password)
    except VmiError as e:
        if e.code in ("612_NO_FILE_FOUND", "610_FILE_ID_EMPTY"):
            return True, "Prisijungimas sėkmingas"
        return False, e.message or e.code
    return True, "Prisijungimas sėkmingas"

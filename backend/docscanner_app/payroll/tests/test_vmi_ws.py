from unittest import TestCase

from docscanner_app.payroll.declarations.vmi_ws import VmiError, _envelope, parse_state, parse_submit

SUBMIT_OK = b"""<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
<soap:Body><SubmitFileResponse xmlns="http://vmi.lt/EDSUploadFile.wsdl"><SubmitFileResult><Result>true</Result>
<ErrorCode>900_SUCCESS</ErrorCode><Message>Failas priimtas sekmingai. Failas turi buti patvirtintas EDS portale iki 2026-10-04.</Message>
<FileId>3f2504e0-4f89-11d3-9a0c-0305e82c3301</FileId></SubmitFileResult></SubmitFileResponse></soap:Body></soap:Envelope>"""

SUBMIT_BAD = b"""<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
<SubmitFileResponse xmlns="http://vmi.lt/EDSUploadFile.wsdl"><SubmitFileResult><Result>false</Result>
<ErrorCode>103_AUTHENTICATION_FAIL_BAD_PASSWORD</ErrorCode><Message>Neteisingas slaptazodis</Message>
<FileId>00000000-0000-0000-0000-000000000000</FileId></SubmitFileResult></SubmitFileResponse></soap:Body></soap:Envelope>"""

STATE = b"""<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
<CheckFileStateResponse xmlns="http://vmi.lt/EDSUploadFile.wsdl"><CheckFileStateResult><Result>true</Result>
<ErrorCode>901_SUCCESS_CHECK_FILE_STATE</ErrorCode><Message>ok</Message>
<FileStateData><UserConfirmedName>ORLOVA SVETLANA</UserConfirmedName><UserConfirmedCode>1</UserConfirmedCode>
<FileConfirmStateCode>10</FileConfirmStateCode><FileStateName>Patvirtintas</FileStateName><FileStateDate>2026-10-02</FileStateDate></FileStateData>
<DeclatationStateData><DeclarationStateName>Priimta</DeclarationStateName><DeclarationStateCode>21</DeclarationStateCode>
<DeclatationStateDate>2026-10-02</DeclatationStateDate><DeclarationActualityStateName>Aktuali</DeclarationActualityStateName>
<DeclarationActualityStateCode>10</DeclarationActualityStateCode></DeclatationStateData></CheckFileStateResult></CheckFileStateResponse>
</soap:Body></soap:Envelope>"""


class VmiWsTests(TestCase):

    def test_submit_ok(self):
        fid, msg = parse_submit(SUBMIT_OK)
        self.assertEqual(fid, "3f2504e0-4f89-11d3-9a0c-0305e82c3301")
        self.assertIn("2026-10-04", msg)

    def test_submit_auth_error(self):
        with self.assertRaises(VmiError) as cm:
            parse_submit(SUBMIT_BAD)
        self.assertTrue(cm.exception.is_auth)

    def test_state(self):
        st = parse_state(STATE)
        self.assertEqual((st.file_state, st.decl_state, st.confirmed_by), (10, 21, "ORLOVA SVETLANA"))

    def test_envelope_escapes(self):
        x = _envelope("SubmitFile", {"UserName": "a&b<c"}).decode()
        self.assertIn("a&amp;b&lt;c", x)

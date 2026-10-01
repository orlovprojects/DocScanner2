Option Explicit

dim ReasonList, ReasonList1SD, ReasonList2SD, ReasonList9SD, ReasonList12SD, ReasonList13SD, ReasonListSAM3SDSD, ReasonListSAM3SDP, ReasonListNPSD, ReasonListNPSD2
dim ReasonMisc, ReasonMisc1SD, ReasonMisc2SD, ReasonMisc9SD, ReasonMisc12SD, ReasonMisc13SD, ReasonMiscSAM3SDSD, ReasonMiscSAM3SDP, ReasonMiscNPSD, ReasonMiscNPSD2
dim ReasonList1SDDet
dim ReasonList1SDDet0506
dim FormDefs
dim FormVersion
dim ActionFields
dim RowFieldsReqCommon, RowFieldsReq1SD, RowFieldsReq2SD, RowFieldsReq9SD, RowFieldsReq12SD, RowFieldsReq13SD, RowFieldsReqSAM3SD, RowFieldsReqSAM3SDP, RowFieldsReqNPSD, RowFieldsReqPeriod, RowFieldsReqCommonNPSD, RowFieldsReqSAM3SDM
dim RowFieldsAllCommon, RowFieldsAll1SD, RowFieldsAll2SD, RowFieldsAll9SD, RowFieldsAll12SD, RowFieldsAll13SD, RowFieldsAllSAM3SD, RowFieldsAllSAM3SDP, RowFieldsAllNPSD, RowFieldsAllSAM3SDM
dim RowCountSupl3SD, RowCountSupl3SDP
dim RowFieldsReq1SD_2, RowFieldsReq2SD_2, RowFieldsReq9SD_2, RowFieldsReq12SD_2, RowFieldsReq13SD_2, RowFieldsReqSAM3SD_2, RowFieldsReqSAM3SDP_2, RowFieldsReqNPSD_2, RowFieldsReqSAM3SDM_2
dim HeaderFieldsReq
dim FooterFieldsReq


Call InitValues
'Call Init
' This function starts execution of the script
Sub Main()
	dim formFields
	dim criticalError
	dim pageCount
	dim ReasonCode
	dim PTForm
	
	Call ResetReasonOnMain
	criticalError = false
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	Call SetPageNumbers(Array(FormDefs(0)))
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(1), Array("InsurerCode","DocDate","DocNumber"))
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(2), Array("InsurerCode","DocDate","DocNumber"))
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(3), Array("InsurerCode","DocDate","DocNumber"))
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(4), Array("InsurerCode","DocDate","DocNumber"))
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(5), Array("InsurerCode","DocDate","DocNumber"))
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(6), Array("InsurerCode","DocDate","DocNumber"))
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(7), Array("InsurerCode","DocDate","DocNumber"))
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(8), Array("InsurerCode","DocDate","DocNumber"))
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(9), Array("InsurerCode","DocDate","DocNumber"))
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(10), Array("InsurerCode","DocDate","DocNumber"))
		
	Call ValidateHeader(formFields)
	Call ValidateFooter(formFields)
	criticalError = not ValidateMainPage(formFields)
	
	if not criticalError then
	  if (FormFields.ItemByName("PTFormCode").value = "1-SD" or _
		  FormFields.ItemByName("PTFormCode").value = "9-SD" or _
			FormFields.ItemByName("PTFormCode").value = "12-SD" or _ 
			FormFields.ItemByName("PTFormCode").value = "13-SD") and _ 
			FormFields.ItemByName("ReasonCode_1").value = "08" then
		  form.seterror "Ši priežastis gali būti pasirenkama tik tikslinant apdraustųjų asmenų draudžiamąsias pajamas dėl sumažinto darbo užmokesčio kompensavimo už laikotarpį nuo 2009-04-01 iki 2014-06-30",_
	    array(FormFields.ItemByName("ReasonCode_1")), el_error
		else
			if FormFields.ItemByName("PTFormCode").value = "1-SD" then Call RecalcBody1SD
			if FormFields.ItemByName("PTFormCode").value = "2-SD" then Call RecalcBody2SD
			if FormFields.ItemByName("PTFormCode").value = "9-SD" then Call RecalcBody9SD
			if FormFields.ItemByName("PTFormCode").value = "12-SD" then Call RecalcBody12SD
			if FormFields.ItemByName("PTFormCode").value = "13-SD" then Call RecalcBody13SD
			if FormFields.ItemByName("PTFormCode").value = "SAM3SD" then Call RecalcBodySAM3SD
			if FormFields.ItemByName("PTFormCode").value = "SAM3SDP" then Call RecalcBodySAM3SDP
			if FormFields.ItemByName("PTFormCode").value = "NP-SD" then Call RecalcBodyNPSD
			if FormFields.ItemByName("PTFormCode").value = "SAM3SD-M" then Call RecalcBodySAM3SDM
			if FormFields.ItemByName("PTFormCode").value = "NP-SD2" then Call RecalcBodyNPSD2
		end if
		'if FormFields.ItemByName("Appendixes1").value = "1" then Call ValidateNr87
	end if
	'Init
	
	if FormFields.ItemByName("ReasonCode_1").value <> "" then
		ReasonCode = FormFields.ItemByName("ReasonCode_1").value
		PTForm = "PT-"&FormFields.ItemByName("PTFormCode").value
		Call CheckReason(ReasonCode, PTForm)
	end if
End Sub

sub check_prf_code(Prof_Kodas, FormFields, PageNum, RowNum)
	
	Dim Kodas, fld1, fld2, fld3, fld4, i, fld_reason
	
	Set fld1 = FormFields.ItemByName("PersonProfession_1_"&RowNum)
	Set fld2 = FormFields.ItemByName("PersonProfession_2_"&RowNum)
	Set fld3 = FormFields.ItemByName("PersonProfession_3_"&RowNum)
	Set fld4 = FormFields.ItemByName("PersonProfession_4_"&RowNum)
	Set fld_reason = FormFields.ItemByName("ReasonCode_"&RowNum)
	
	if fld_reason.value = "01" or fld_reason.value = "03" or fld_reason.value = "05" or fld_reason.value = "06" or fld_reason.value = "07" or fld_reason.value = "08" or fld_reason.value = "14" or fld_reason.value = "15" or fld_reason.value = "19" or fld_reason.value = "96" then
		if fld1.value <> "" and fld2.value <> "" and fld3.value <> "" and fld4.value <> "" then
			Kodas = fld1.value&fld2.value&fld3.value&fld4.value
		Else
			Form.SetError "Nenurodytas asmens profesijos kodas "&PageNum&" lapo "&RowNum&" eilutėje", array(FormFields.ItemByName("PersonProfession_1_"&RowNum), FormFields.ItemByName("PersonProfession_2_"&RowNum),FormFields.ItemByName("PersonProfession_3_"&RowNum), FormFields.ItemByName("PersonProfession_4_"&RowNum))
		end if
	else
		if fld1.value <> "" or fld2.value <> "" or fld3.value <> "" or fld4.value <> "" then
	        	Form.SetError "Asmens profesijos kodas pildomas, kai pranešimo pateikimo priežastys - 01, 03, 05, 06, 07, 08, 14, 15, 19, 96 "&PageNum&" lapo "&RowNum&" eilutėje", array(FormFields.ItemByName("PersonProfession_1_"&RowNum), FormFields.ItemByName("PersonProfession_2_"&RowNum),FormFields.ItemByName("PersonProfession_3_"&RowNum), FormFields.ItemByName("PersonProfession_4_"&RowNum))
	  	end if	
	end if		
end sub

Function Prof_KodaiB
	Dim Pav
	Set Pav = CreateObject("Scripting.Dictionary")
	Set Prof_KodaiB = Pav

End Function			

' Paleidus forma inicijuojamas pirmo lygio profesiju sarasas visiems lapams
Sub Init
	Dim prof_list_1(8)
	Dim fields, fld1, p, i, pages
	set pages = form.getpagesfortemplate("PT-1-SD")
	for p = 1 to pages.count
		set fields = pages.item(p).fields
		set fld1 = fields.ItemByName("PersonProfession_1_2")
		if fld1.value = "" then
			'prof_list_1(0) = "0;Ginkluotųjų pajėgų profesijos"
			prof_list_1(0) = "1;Vadovai"
			prof_list_1(1) = "2;Specialistai"
			prof_list_1(2) = "3;Technikai ir jaunesnieji specialistai"
			prof_list_1(3) = "4;Tarnautojai"
			prof_list_1(4) = "5;Paslaugų sektoriaus darbuotojai ir pardavėjai"
			prof_list_1(5) = "6;Kvalifikuoti žemės, miškų ir žuvininkystės ūkio darbuotojai"
			prof_list_1(6) = "7;Kvalifikuoti darbininkai ir amatininkai"
			prof_list_1(7) = "8;Įrenginių ir mašinų operatoriai ir surinkėjai"
			prof_list_1(8) = "9;Pagalbiniai (nekvalifikuoti) darbininkai"
			fld1.AttachList prof_list_1
			Fields.itemByName("PersonProfession_1_2").SetCheckValue cStr(fld1.Value)	 
		end if
	next
End Sub	

sub CheckReason(ReasonCode, PTForm)
	dim pages, fields, p, varFr, masFormos
  	masFormos  = Array("PT-2-SD","PT-SAM3SD","PT-SAM3SDP", "PT-SAM3SD-M", "PT-NP-SD", "PT-NP-SD2")
	
	if ReasonCode = "08" then
		For Each varFr In masFormos
		  if PTForm = varFr then
				set pages = form.getpagesfortemplate(varFr)
				for p = 1 to pages.count
					set fields = pages.item(p).fields
					'DT19-112
					if varFr = "PT-SAM3SD" then
						if ((fields.itemByName("RevisedCycleYear").value = "2009" and fields.itemByName("RevisedCycleQuarter").value = "1") or _
							fields.itemByName("RevisedCycleYear").value < "2009" or _
							fields.itemByName("RevisedCycleYear").value > "2014") then
							form.seterror "Ši priežastis gali būti pasirenkama tik tikslinant apdraustųjų asmenų draudžiamąsias pajamas dėl sumažinto darbo užmokesčio kompensavimo už laikotarpį nuo 2009-04-01 iki 2014-06-30 "&p+1&" lapas",_
							Array(fields.ItemByName("RevisedCycleYear")), el_error
						elseif (fields.itemByName("RevisedCycleYear").value = "2014" and fields.itemByName("RevisedCycleMonth").value > "6") then
							form.seterror "Ši priežastis gali būti pasirenkama tik tikslinant apdraustųjų asmenų draudžiamąsias pajamas dėl sumažinto darbo užmokesčio kompensavimo už laikotarpį nuo 2009-04-01 iki 2014-06-30 "&p+1&" lapas", Array(fields.ItemByName("RevisedCycleYear")), el_error 
						end if
					elseif varFr = "PT-SAM3SDP" then	
						if ((fields.itemByName("RevisedCycleYear").value = "2009" and fields.itemByName("RevisedCycleQuarter").value = "1") or _
							fields.itemByName("RevisedCycleYear").value < "2009" or _
							fields.itemByName("RevisedCycleYear").value > "2014") or _ 
							((fields.itemByName("PeriodStartDate_2").todate < DateValue("2009-04-01") or fields.itemByName("PeriodStartDate_2").todate > DateValue("2014-06-30"))) then
							form.seterror "Ši priežastis gali būti pasirenkama tik tikslinant apdraustųjų asmenų draudžiamąsias pajamas dėl sumažinto darbo užmokesčio kompensavimo už laikotarpį nuo 2009-04-01 iki 2014-06-30 "&p+1&" lapas",_
							Array(fields.ItemByName("RevisedCycleYear"), fields.ItemByName("PeriodStartDate_2")), el_error
						elseif (fields.itemByName("RevisedCycleYear").value = "2014" and fields.itemByName("RevisedCycleMonth").value > "6") or _ 
							((fields.itemByName("PeriodStartDate_2").todate < DateValue("2009-04-01") or fields.itemByName("PeriodStartDate_2").todate > DateValue("2014-06-30"))) then
							form.seterror "Ši priežastis gali būti pasirenkama tik tikslinant apdraustųjų asmenų draudžiamąsias pajamas dėl sumažinto darbo užmokesčio kompensavimo už laikotarpį nuo 2009-04-01 iki 2014-06-30 "&p+1&" lapas", Array(fields.ItemByName("RevisedCycleYear"), fields.ItemByName("PeriodStartDate_2")), el_error 
						end if
					elseif varFr = "PT-2-SD" then
						if ((fields.itemByName("RevisedCycleYear").value = "2009" and _
								(fields.itemByName("RevisedCycleMonth").value = "1" or _
								 fields.itemByName("RevisedCycleMonth").value = "2" or _
								 fields.itemByName("RevisedCycleMonth").value = "3")) or _
							fields.itemByName("RevisedCycleYear").value < "2009" or _
							fields.itemByName("RevisedCycleYear").value > "2014") or _ 
							((fields.itemByName("InsuranceEndDate_2").todate < DateValue("2009-04-01") or fields.itemByName("InsuranceEndDate_2").todate > DateValue("2014-06-30"))) then
								form.seterror "Ši priežastis gali būti pasirenkama tik tikslinant apdraustųjų asmenų draudžiamąsias pajamas dėl sumažinto darbo užmokesčio kompensavimo už laikotarpį nuo 2009-04-01 iki 2014-06-30 "&p+1&" lapas",_
								Array(fields.ItemByName("RevisedCycleYear"), fields.ItemByName("InsuranceEndDate_2")), el_error
						elseif (fields.itemByName("RevisedCycleYear").value = "2014" and fields.itemByName("RevisedCycleMonth").value > "6") or _ 
							((fields.itemByName("InsuranceEndDate_2").todate < DateValue("2009-04-01") or fields.itemByName("InsuranceEndDate_2").todate > DateValue("2014-06-30"))) then
							form.seterror "Ši priežastis gali būti pasirenkama tik tikslinant apdraustųjų asmenų draudžiamąsias pajamas dėl sumažinto darbo užmokesčio kompensavimo už laikotarpį nuo 2009-04-01 iki 2014-06-30 "&p+1&" lapas", Array(fields.ItemByName("RevisedCycleYear"), fields.ItemByName("InsuranceEndDate_2")), el_error
						end if
					elseif 	varFr = "PT-NP-SD" or varFr = "PT-NP-SD2" then
						if ((fields.itemByName("RevisedCycleYear").value = "2009" and _
								(fields.itemByName("RevisedCycleMonth").value = "1" or _
								 fields.itemByName("RevisedCycleMonth").value = "2" or _
								 fields.itemByName("RevisedCycleMonth").value = "3")) or _
							fields.itemByName("RevisedCycleYear").value < "2009" or _
							fields.itemByName("RevisedCycleYear").value > "2014") then
							form.seterror "Ši priežastis gali būti pasirenkama tik tikslinant apdraustųjų asmenų draudžiamąsias pajamas dėl sumažinto darbo užmokesčio kompensavimo už laikotarpį nuo 2009-04-01 iki 2014-06-30 "&p+1&" lapas",_
							Array(fields.ItemByName("RevisedCycleYear")), el_error
						elseif (fields.itemByName("RevisedCycleYear").value = "2014" and fields.itemByName("RevisedCycleMonth").value > "6") then
							form.seterror "Ši priežastis gali būti pasirenkama tik tikslinant apdraustųjų asmenų draudžiamąsias pajamas dėl sumažinto darbo užmokesčio kompensavimo už laikotarpį nuo 2009-04-01 iki 2014-06-30 "&p+1&" lapas", Array(fields.ItemByName("RevisedCycleYear")), el_error
						end if
					elseif varFr = "PT-SAM3SD-M" then
						if fields.itemByName("RevisedCycleYear").value < "2009" or _
							fields.itemByName("RevisedCycleYear").value > "2014" then				 
							form.seterror "Ši priežastis gali būti pasirenkama tik tikslinant apdraustųjų asmenų draudžiamąsias pajamas dėl sumažinto darbo užmokesčio kompensavimo už laikotarpį nuo 2009-01-01 iki 2014-12-31 "&p+1&" lapas",_
							Array(fields.ItemByName("RevisedCycleYear")), el_error 
						end if
					end if
				next
			end if
		next
	else
		'DT19-016
		set pages = form.getpagesfortemplate("PT-SAM3SD-M")
		for p = 1 to pages.count
			set fields = pages.item(p).fields
			if fields.itemByName("RevisedCycleYear").value < "2010" then				 
				form.seterror "Priedas PT-SAM3SD-M pildomas už laikotarpį nuo 2010-01-01 "&p+1&" lapas",_
				Array(fields.ItemByName("RevisedCycleYear")), el_error 
			end if
		next
	end if
End Sub

Sub onAppend()
	'Add your code here
End Sub

Sub onInit()
	form.getpagesForTemplate(FormDefs(0)).Item(1).fields.itembyname("DocDate").setCheckValue "" & Form.FormatDate(date)
	Call SetFormCodeVers(FormDefs(0), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(1), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(2), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(3), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(4), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(5), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(6), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(7), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(8), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(9), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(10), 0, FormVersion)
	Call SetPageNumbers(Array(FormDefs(0)))
	Call SetOnChangedHandlers
	'Form.SetOnChangedHandler "SetPTReasonText", "PT", "ReasonCode_1"
End Sub

Sub onAddPage(PageName, PageIndex)
	dim i
	
	Call SetPageNumbers(Array(FormDefs(0)))
	Call SetFormCodeVers(PageName, PageIndex, FormVersion)
End Sub

Sub InitValues()
	Form.SetDefaultDecimalSeparator ","
	Form.SetDefaultDateFormat DF_YearMonthDay, YL_FourDigits, "-"
	'-- ReasonList classificator values ------------------------------------

	ReasonList = Array(_
		Array("01","PAVĖLUOTAI TEIKIAMI DUOMENYS",Array()),_
		Array("02","DUOMENYS TIKSLINAMI PAGAL PATIKRINIMO REZULTATUS",Array()),_
		Array("03","DUOMENYS TIKSLINAMI DĖL DRAUDĖJUI PASIKEITUSIŲ APLINKYBIŲ",Array()),_
		Array("04","DUOMENYS TIKSLINAMI PAGAL TEISMO SPRENDIMĄ / NUTARTĮ",Array()),_
		Array("05","TAIKOMA SOCIALINĖ APSAUGA PAGAL EUROPOS SĄJUNGOS REGLAMENTUS",Array()),_
		Array("06","TAIKOMA SOCIALINĖ APSAUGA PAGAL DVIŠALĘ SUTARTĮ",Array()),_
		Array("07","DUOMENYS TIKSLINAMI DĖL DRAUDĖJO APSKAITOS KLAIDOS",Array()),_
		Array("08","DUOMENYS TIKSLINAMI DĖL SUMAŽINTO DARBO UŽMOKESČIO KOMPENSAVIMO",Array()),_
		Array("99","KITI ATVEJAI",Array())_
	)
	
	ReasonList1SD = Array(_
		Array("01","priėmimas į darbą (pagal darbo sutartį)",_
		  Array(_
			  Array("01","neterminuota darbo sutartis"),_
				Array("02","terminuota darbo sutartis"),_ 
				Array("03","laikinojo darbo sutartis"),_
				Array("04","pameistrystės darbo sutartis"),_ 
				Array("05","projektinio darbo sutartis"),_
				Array("06","darbo vietos dalijimosi darbo sutartis"),_ 
				Array("07","darbo keliems darbdaviams sutartis"),_ 
				Array("08","sezoninio darbo sutartis")_ 
			)_
		),_
		Array("03","reorganizavimas",Array()),_
		Array("05","socialinė apsauga pagal Europos Sąjungos Reglamentus",_
			Array(_
				Array("IE","Airija"),_
				Array("AT","Austrija"),_
				Array("BY","Baltarusija"),_
				Array("BE","Belgija"),_
				Array("BG","Bulgarija"),_
				Array("CZ","Čekija"),_
				Array("DK","Danija"),_
				Array("GB","Didžioji Britanija"),_
				Array("EE","Estija"),_
				Array("GR","Graikija"),_
				Array("IS","Islandija"),_
				Array("ES","Ispanija"),_
				Array("IT","Italija"),_
				Array("CA","Kanada"),_
				Array("CY","Kipras"),_
				Array("HR","Kroatija"),_
				Array("LV","Latvija"),_
				Array("PL","Lenkija"),_
				Array("LI","Lichtenšteinas"),_
				Array("LT","Lietuva"),_
				Array("LU","Liuksemburgas"),_
				Array("MT","Malta"),_
				Array("NL","Nyderlandai"),_
				Array("NO","Norvegija."),_
				Array("PT","Portugalija"),_
				Array("FR","Prancūzija"),_
				Array("RO","Rumunija"),_
				Array("SK","Slovakija"),_
				Array("SI","Slovėnija"),_
				Array("FI","Suomija"),_
				Array("SE","Švedija"),_
				Array("CH","Šveicarija"),_
				Array("UA","Ukraina"),_
				Array("HU","Vengrija"),_
				Array("DE","Vokietija")_
			)_
		),_
		Array("06","socialinė apsauga pagal dvišalę sutartį",_
			Array(_
				Array("BY","Baltarusija"),_
				Array("CA","Kanada"),_
				Array("UA","Ukraina"),_
				Array("RU","Rusija"),_
				Array("US","JAV")_
			)_
		),_
		Array("07","valstybės tarnautojo perkėlimas (kitoje valstybėje)",Array()),_
		Array("08","valstybės tarnautojo perkėlimas (Lietuvoje)",Array()),_
		Array("09","valstybės lėšomis draudžiamas sutuoktinis",Array()),_
		Array("10","užimtumo tarnybos siųstas praktikantas",Array()),_
		Array("11","švietimo įstaigos praktikantas",Array()),_
		Array("12","dvasininkas",Array()),_
		Array("13","privalomoji pradinė karo tarnyba",Array()),_
		Array("14","perkėlimas pas kitą draudėją",_
		  Array(_
			  Array("01","neterminuota darbo sutartis"),_
				Array("02","terminuota darbo sutartis"),_ 
				Array("03","laikinojo darbo sutartis"),_
				Array("04","pameistrystės darbo sutartis"),_ 
				Array("05","projektinio darbo sutartis"),_
				Array("06","darbo vietos dalijimosi darbo sutartis"),_ 
				Array("07","darbo keliems darbdaviams sutartis"),_ 
				Array("08","sezoninio darbo sutartis")_ 
			)_
		),_
		Array("15","priėmimas į pareigas valstybės tarnyboje",Array()),_
		Array("17","savanoriška praktika",Array()),_
		Array("18","kursantas",Array()),_
		Array("19","darbuotojas, neturintis prievolės mokėti psd įmokų",_
		  Array(_
				Array("01","neterminuota darbo sutartis"),_
				Array("02","terminuota darbo sutartis"),_ 
				Array("03","laikinojo darbo sutartis"),_
				Array("04","pameistrystės darbo sutartis"),_ 
				Array("05","projektinio darbo sutartis"),_
				Array("06","darbo vietos dalijimosi darbo sutartis"),_ 
				Array("07","darbo keliems darbdaviams sutartis"),_ 
				Array("08","sezoninio darbo sutartis")_ 
			)_
		),_
		Array("20","kariūnas",Array()),_
		Array("21","eina narystės pagrindu renkamąsias/skiriamąsias pareigas",Array()),_
		Array("22","įgyta teisė nemokėti PSD įmokų arba nustatyta prievolė mokėti PSD",_
		  Array(_
			  Array("01","neterminuota darbo sutartis"),_
				Array("02","terminuota darbo sutartis"),_ 
				Array("03","laikinojo darbo sutartis"),_
				Array("04","pameistrystės darbo sutartis"),_ 
				Array("05","projektinio darbo sutartis"),_
				Array("06","darbo vietos dalijimosi darbo sutartis"),_ 
				Array("07","darbo keliems darbdaviams sutartis"),_ 
				Array("08","sezoninio darbo sutartis")_ 
			)_
		),_
		Array("23","rinkimų ar referendumų komisijų nariai nuo 2022-01-01",Array()),_
		Array("96","darbo sutarties rūšies priskyrimas/pakeitimas",_
		  Array(_
			  Array("01","neterminuota darbo sutartis"),_
				Array("02","terminuota darbo sutartis"),_ 
				Array("03","laikinojo darbo sutartis"),_
				Array("04","pameistrystės darbo sutartis"),_ 
				Array("05","projektinio darbo sutartis"),_
				Array("06","darbo vietos dalijimosi darbo sutartis"),_ 
				Array("07","darbo keliems darbdaviams sutartis"),_ 
				Array("08","sezoninio darbo sutartis")_ 
			)_
		)_
	)

  ReasonList1SDDet0506 = Array(_
													Array("01","neterminuota darbo sutartis"),_
													Array("02","terminuota darbo sutartis"),_ 
													Array("031","terminuota laikinojo darbo sutartis"),_
													Array("032","neterminuota laikinojo darbo sutartis"),_
													Array("04","pameistrystės darbo sutartis"),_ 
													Array("05","projektinio darbo sutartis"),_
													Array("061","terminuota darbo vietos dalijimosi darbo sutartis"),_
													Array("062","neterminuota darbo vietos dalijimosi darbo sutartis"),_
													Array("071","terminuota darbo keliems darbdaviams sutartis"),_
													Array("072","neterminuota darbo keliems darbdaviams sutartis"),_
													Array("081","terminuota sezoninio darbo sutartis"),_
													Array("082","neterminuota sezoninio darbo sutartis")_  												
												)
	
	ReasonList1SDDet = Array(_
		Array("03","laikinojo darbo sutartis",_
		  Array(_
			  Array("031","terminuota laikinojo darbo sutartis"),_
				Array("032","neterminuota laikinojo darbo sutartis")_
			)_
		),_
		Array("06","darbo vietos dalijimosi darbo sutartis",_
		  Array(_
				Array("061","terminuota darbo vietos dalijimosi darbo sutartis"),_
				Array("062","neterminuota darbo vietos dalijimosi darbo sutartis")_ 
			)_
		),_
		Array("07","darbo keliems darbdaviams sutartis",_
		  Array(_
				Array("071","terminuota darbo keliems darbdaviams sutartis"),_
				Array("072","neterminuota darbo keliems darbdaviams sutartis")_ 
			)_
		),_
		Array("08","sezoninio darbo sutartis",_
		  Array(_
				Array("081","terminuota sezoninio darbo sutartis"),_
				Array("082","neterminuota sezoninio darbo sutartis")_ 
			)_
		),_
		Array("IE","Airija",ReasonList1SDDet0506),_
		Array("AT","Austrija",ReasonList1SDDet0506),_
		Array("BY","Baltarusija",ReasonList1SDDet0506),_
		Array("BE","Belgija",ReasonList1SDDet0506),_
		Array("BG","Bulgarija",ReasonList1SDDet0506),_
		Array("CZ","Čekija",ReasonList1SDDet0506),_
		Array("DK","Danija",ReasonList1SDDet0506),_
		Array("GB","Didžioji Britanija",ReasonList1SDDet0506),_
		Array("EE","Estija",ReasonList1SDDet0506),_
		Array("GR","Graikija",ReasonList1SDDet0506),_
		Array("IS","Islandija",ReasonList1SDDet0506),_
		Array("ES","Ispanija",ReasonList1SDDet0506),_
		Array("IT","Italija",ReasonList1SDDet0506),_
		Array("CA","Kanada",ReasonList1SDDet0506),_
		Array("CY","Kipras",ReasonList1SDDet0506),_
		Array("HR","Kroatija",ReasonList1SDDet0506),_
		Array("LV","Latvija",ReasonList1SDDet0506),_
		Array("PL","Lenkija",ReasonList1SDDet0506),_
		Array("LI","Lichtenšteinas",ReasonList1SDDet0506),_
		Array("LT","Lietuva",ReasonList1SDDet0506),_
		Array("LU","Liuksemburgas",ReasonList1SDDet0506),_
		Array("MT","Malta",ReasonList1SDDet0506),_
		Array("NL","Nyderlandai",ReasonList1SDDet0506),_
		Array("NO","Norvegija.",ReasonList1SDDet0506),_
		Array("PT","Portugalija",ReasonList1SDDet0506),_
		Array("FR","Prancūzija",ReasonList1SDDet0506),_
		Array("RO","Rumunija",ReasonList1SDDet0506),_
		Array("SK","Slovakija",ReasonList1SDDet0506),_
		Array("SI","Slovėnija",ReasonList1SDDet0506),_
		Array("FI","Suomija",ReasonList1SDDet0506),_
		Array("SE","Švedija",ReasonList1SDDet0506),_
		Array("CH","Šveicarija",ReasonList1SDDet0506),_
		Array("UA","Ukraina",ReasonList1SDDet0506),_
		Array("HU","Vengrija",ReasonList1SDDet0506),_
		Array("DE","Vokietija",ReasonList1SDDet0506),_
		Array("RU","Rusija",ReasonList1SDDet0506),_
		Array("US","JAV",ReasonList1SDDet0506)_
	)
	
	ReasonList2SD = Array(_
		Array("02","atleidimas iš darbo (pagal darbo sutartį)",_
			Array(_
				Array("K01","Darbo kodeksas",_
					Array(_
						Array("53","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas")_
									)_
								)_
							)_
						),_
						Array("54","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array()_
								)_
							)_
						),_
						Array("55","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array()_
								)_
							)_
						),_
						Array("56","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas")_
									)_
								)_
							)_
						),_
						Array("57","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						),_
						Array("58","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array()_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas")_
									)_
								)_
							)_
						),_
						Array("59","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas")_
									)_
								)_
							)_
						),_
						Array("60","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas")_
									)_
								)_
							)_
						),_
						Array("62","straipsnis",_
							Array(_
								Array("2","dalis",_
									Array()_
								)_
							)_
						),_
						Array("107","straipsnis",_
							Array(_
								Array("1","dalis",Array()),_
								Array("2","dalis",Array())_
							)_
						),_
						Array("124","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas")_
									)_
								)_
							)_
						),_
						Array("125","straipsnis",_
							Array(_
								Array("1","dalis",Array()),_
								Array("2","dalis",Array())_
							)_
						),_
						Array("126","straipsnis",_
							Array(_
								Array("1","dalis",Array())_
							)_
						),_
						Array("127","straipsnis",_
							Array(_
								Array("1","dalis",Array()),_
								Array("2","dalis",Array())_
							)_
						),_
						Array("128","straipsnis",_
							Array(_
								Array("1","dalis",Array())_
							)_
						),_
						Array("129","straipsnis",_
							Array(_
								Array("1","dalis",Array()),_
								Array("2","dalis",Array()),_
								Array("4","dalis",Array()),_
								Array("5","dalis",Array())_
							)_
						),_
						Array("136","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								),_
								Array("2","dalis",Array()),_
								Array("3","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas")_
									)_
								)_
							)_
						),_
						Array("137","straipsnis",Array()),_
						Array("139","straipsnis",_
							Array(_
								Array("1","dalis",Array()),_
								Array("2","dalis",Array())_
							)_
						),_
						Array("297","straipsnis",_
							Array(_
								Array("4","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K02","Tarnybos kalėjimų dep. prie LR teisingumo minist. statutas",_
					Array(_
						Array("32","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas")_
									)_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas"),_
										Array("15","punktas"),_
										Array("16","punktas"),_
										Array("17","punktas"),_
										Array("18","punktas"),_
										Array("19","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K03","Tarnybos LR muitinėje statutas",_
					Array(_
						Array("55","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas"),_
										Array("15","punktas"),_
										Array("16","punktas"),_
										Array("17","punktas"),_
										Array("18","punktas"),_
										Array("19","punktas"),_
										Array("20","punktas"),_
										Array("21","punktas"),_
										Array("22","punktas")_
									)_
								)_
							)_
						),_
						Array("55-1","straipsnis",Array())_
					)_
				),_
				Array("K04","Valstybės saugumo departamento statutas",_
					Array(_
						Array("22","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas"),_
										Array("15","punktas"),_
										Array("16","punktas"),_
										Array("17","punktas"),_
										Array("18","punktas"),_
										Array("19","punktas")_
									)_
								)_
							)_
						),_
						Array("26","straipsnis",Array())_
					)_
				),_
				Array("K05","Specialiųjų tyrimų tarnybos statutas",_
					Array(_
						Array("11","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas")_
									)_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K06","Vidaus tarnybos statutas",_
					Array(_
						Array("53","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas"),_
										Array("15","punktas"),_
										Array("16","punktas"),_
										Array("17","punktas"),_
										Array("18","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K07","Civilinės krašto apsaugos tarnybos statutas",_
					Array(_
						Array("10","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas")_
									)_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K08","2-ojo operatyvinių tarnybų departamento prie KAM statutas",_
					Array(_
						Array("22","straipsnis",_
							Array(_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas")_
									)_
								),_
								Array("3","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K09","Seimo statutas",_
					Array(_
						Array("8","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K10","LR valstybės tarnybos įstatymas",_
					Array(_
						Array("44","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas"),_
										Array("15","punktas"),_
										Array("16","punktas"),_
										Array("17","punktas"),_
										Array("18","punktas"),_
										Array("19","punktas"),_
										Array("20","punktas"),_
										Array("21","punktas")_
									)_
								),_
								Array("2","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K11","LR diplomatinės tarnybos įstatymas",_
					Array(_
						Array("58","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas")_
									)_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas")_
									)_
								),_
								Array("3","dalis",Array()),_
								Array("5","dalis",Array()),_
								Array("9","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K12","LR teismų įstatymas",_
					Array(_
						Array("81","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas")_
									)_
								)_
							)_
						),_
						Array("82","straipsnis",Array()),_
						Array("90","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								),_
								Array("2","dalis",Array())_
							)_
						),_
						Array("91","straipsnis",Array())_
					)_
				),_
				Array("K13","LR prokuratūros istatymas",_
					Array(_
						Array("22","straipsnis",_
							Array(_
								Array("5","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas")_
									)_
								)_
							)_
						),_
						Array("44","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas")_
									)_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas")_
									)_
								)_
							)_
						),_
						Array("45","straipsnis",_
							Array(_
								Array("6","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K14","LR Konstitucinio Teismo įstatymas",_
					Array(_
						Array("11","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K15","LR Vyriausybės įstatymas",_
					Array(_
						Array("10","straipsnis",_
							Array(_
								Array("2","dalis",Array()),_
								Array("3","dalis",Array()),_
								Array("4","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K16","LR krašto apsaugos sistemos organizavimo ir KT įstatymas",_
					Array(_
						Array("37","straipsnis",_
							Array(_
								Array("1","dalis",Array())_
							)_
						),_
						Array("38","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas")_
									)_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K17","LR Seimo kontrolierių įstatymas",_
					Array(_
						Array("9","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K18","LR valstybės kontrolės įstatymas",_
					Array(_
						Array("34","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						),_
						Array("35","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						),_
						Array("36","straipsnis",_
							Array(_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K19","LR moterų ir vyrų lygių galimybių įstatymas",_
					Array(_
						Array("15","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								),_
								Array("2","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K20","LR vaiko teisių apsaugos kontrolieriaus įstatymas",_
					Array(_
						Array("8","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K21","LR visuomenės informavimo įstatymas",_
					Array(_
						Array("49","straipsnis",_
							Array(_
								Array("8","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K22","LR vyriausiosios rinkimų komisijos įstatymas",_
					Array(_
						Array("10","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas")_
									)_
								),_
								Array("2","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K23","LR vyriausiosios tarnybinės etikos komisijos įstatymas",_
					Array(_
						Array("14","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K24","LR Lietuvos banko įstatymas",_
					Array(_
						Array("12","straipsnis",_
							Array(_
								Array("1","dalis",Array())_
							)_
						),_
						Array("13","straipsnis",_
							Array(_
								Array("1","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K25","LR finansinių priemonių rinkų įstatymas",_
					Array(_
						Array("70","straipsnis",_
							Array(_
								Array("4","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K26","LR azartinių lošimų įstatymas",_
					Array(_
						Array("26","straipsnis",_
							Array(_
								Array("4","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K27","LR energetikos įstatymas",_
					Array(_
						Array("17","straipsnis",_
							Array(_
								Array("4","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K28","LR konkurencijos įstatymas",_
					Array(_
						Array("20","straipsnis",_
							Array(_
								Array("3","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K29","LR draudimo įstatymas",_
					Array(_
						Array("182","straipsnis",_
							Array(_
								Array("7","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K30","LR mokesčių administravimo įstatymas",_
					Array(_
						Array("148","straipsnis",_
							Array(_
								Array("5","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K31","LR administracinių ginčų komisijų įstatymas",_
					Array(_
						Array("7","straipsnis",_
							Array(_
								Array("2","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K32","LR vietos savivaldos įstatymas",_
					Array(_
						Array("16","straipsnis",_
							Array(_
								Array("2","dalis",_
									Array(_
										Array("2","punktas")_
									)_
								)_
							)_
						),_
						Array("19","straipsnis",_
							Array(_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas")_
									)_
								),_
								Array("3","dalis",Array()),_
								Array("4","dalis",Array()),_
								Array("5","dalis",Array()),_
								Array("6","dalis",Array()),_
								Array("7","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K33","LR savivaldybių tarybų rinkimų įstatymas",_
					Array(_
						Array("87","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas")_
									)_
								),_
								Array("2","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K34","LR konstitucija",_
					Array(_
						Array("63","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas")_
									)_
								)_
							)_
						),_
						Array("84","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("11","punktas"),_
										Array("14","punktas")_
									)_
								)_
							)_
						),_
						Array("88","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						),_
						Array("108","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						),_
						Array("115","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K99","Kitas teisės aktas",Array())_
			)_
		),_
		Array("03","reorganizavimas",Array()),_
		Array("04","pertvarkymas",Array()),_
		Array("05","socialinė apsauga pagal Europos Sąjungos Reglamentus",_
			Array(_
				Array("IE","Airija"),_
				Array("AT","Austrija"),_
				Array("BY","Baltarusija"),_
				Array("BE","Belgija"),_
				Array("BG","Bulgarija"),_
				Array("CZ","Čekija"),_
				Array("DK","Danija"),_
				Array("GB","Didžioji Britanija"),_
				Array("EE","Estija"),_
				Array("GR","Graikija"),_
				Array("IS","Islandija"),_
				Array("ES","Ispanija"),_
				Array("IT","Italija"),_
				Array("CA","Kanada"),_
				Array("CY","Kipras"),_
				Array("HR","Kroatija"),_
				Array("LV","Latvija"),_
				Array("PL","Lenkija"),_
				Array("LI","Lichtenšteinas"),_
				Array("LT","Lietuva"),_
				Array("LU","Liuksemburgas"),_
				Array("MT","Malta"),_
				Array("NL","Nyderlandai"),_
				Array("NO","Norvegija."),_
				Array("PT","Portugalija"),_
				Array("FR","Prancūzija"),_
				Array("RO","Rumunija"),_
				Array("SK","Slovakija"),_
				Array("SI","Slovėnija"),_
				Array("FI","Suomija"),_
				Array("SE","Švedija"),_
				Array("CH","Šveicarija"),_
				Array("UA","Ukraina"),_
				Array("HU","Vengrija"),_
				Array("DE","Vokietija")_
			)_
		),_
		Array("06","socialinė apsauga pagal dvišalę sutartį",_
			Array(_
				Array("BY","Baltarusija"),_
				Array("CA","Kanada"),_
				Array("UA","Ukraina"),_
				Array("RU","Rusija"),_
				Array("US","JAV")_
			)_
		),_
		Array("07","valstybės tarnautojo perkėlimas (kitoje valstybėje)",Array()),_
		Array("08","valstybės tarnautojo perkėlimas (Lietuvoje)",Array()),_
		Array("09","valstybės lėšomis draudžiamas sutuoktinis",Array()),_
		Array("10","užimtumo tarnybos siųstas praktikantas",Array()),_
		Array("11","švietimo įstaigos praktikantas",Array()),_
		Array("12","dvasininkas",Array()),_
		Array("13","privalomoji pradinė karo tarnyba",Array()),_
		Array("14","perkėlimas pas kitą draudėją",Array()),_
		Array("16","atleidimas iš pareigų valstybės tarnyboje",_
			Array(_
				Array("K01","Darbo kodeksas",_
					Array(_
						Array("53","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas")_
									)_
								)_
							)_
						),_
						Array("54","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array()_
								)_
							)_
						),_
						Array("55","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array()_
								)_
							)_
						),_
						Array("56","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas")_
									)_
								)_
							)_
						),_
						Array("57","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						),_
						Array("58","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array()_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas")_
									)_
								)_
							)_
						),_
						Array("59","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas")_
									)_
								)_
							)_
						),_
						Array("60","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas")_
									)_
								)_
							)_
						),_
						Array("62","straipsnis",_
							Array(_
								Array("2","dalis",_
									Array()_
								)_
							)_
						),_
						Array("107","straipsnis",_
							Array(_
								Array("1","dalis",Array()),_
								Array("2","dalis",Array())_
							)_
						),_
						Array("124","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas")_
									)_
								)_
							)_
						),_
						Array("125","straipsnis",_
							Array(_
								Array("1","dalis",Array()),_
								Array("2","dalis",Array())_
							)_
						),_
						Array("126","straipsnis",_
							Array(_
								Array("1","dalis",Array())_
							)_
						),_
						Array("127","straipsnis",_
							Array(_
								Array("1","dalis",Array()),_
								Array("2","dalis",Array())_
							)_
						),_
						Array("128","straipsnis",_
							Array(_
								Array("1","dalis",Array())_
							)_
						),_
						Array("129","straipsnis",_
							Array(_
								Array("1","dalis",Array()),_
								Array("2","dalis",Array()),_
								Array("4","dalis",Array()),_
								Array("5","dalis",Array())_
							)_
						),_
						Array("136","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								),_
								Array("2","dalis",Array()),_
								Array("3","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas")_
									)_
								)_
							)_
						),_
						Array("137","straipsnis",Array()),_
						Array("139","straipsnis",_
							Array(_
								Array("1","dalis",Array()),_
								Array("2","dalis",Array())_
							)_
						),_
						Array("297","straipsnis",_
							Array(_
								Array("4","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K02","Tarnybos kalėjimų dep. prie LR teisingumo minist. statutas",_
					Array(_
						Array("32","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas")_
									)_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas"),_
										Array("15","punktas"),_
										Array("16","punktas"),_
										Array("17","punktas"),_
										Array("18","punktas"),_
										Array("19","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K03","Tarnybos LR muitinėje statutas",_
					Array(_
						Array("55","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas"),_
										Array("15","punktas"),_
										Array("16","punktas"),_
										Array("17","punktas"),_
										Array("18","punktas"),_
										Array("19","punktas"),_
										Array("20","punktas"),_
										Array("21","punktas"),_
										Array("22","punktas")_
									)_
								)_
							)_
						),_
						Array("55-1","straipsnis",Array())_
					)_
				),_
				Array("K04","Valstybės saugumo departamento statutas",_
					Array(_
						Array("22","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas"),_
										Array("15","punktas"),_
										Array("16","punktas"),_
										Array("17","punktas"),_
										Array("18","punktas"),_
										Array("19","punktas")_
									)_
								)_
							)_
						),_
						Array("26","straipsnis",Array())_
					)_
				),_
				Array("K05","Specialiųjų tyrimų tarnybos statutas",_
					Array(_
						Array("11","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas")_
									)_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K06","Vidaus tarnybos statutas",_
					Array(_
						Array("53","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas"),_
										Array("15","punktas"),_
										Array("16","punktas"),_
										Array("17","punktas"),_
										Array("18","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K07","Civilinės krašto apsaugos tarnybos statutas",_
					Array(_
						Array("10","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas")_
									)_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K08","2-ojo operatyvinių tarnybų departamento prie KAM statutas",_
					Array(_
						Array("22","straipsnis",_
							Array(_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas")_
									)_
								),_
								Array("3","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K09","Seimo statutas",_
					Array(_
						Array("8","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K10","LR valstybės tarnybos įstatymas",_
					Array(_
						Array("44","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas"),_
										Array("14","punktas"),_
										Array("15","punktas"),_
										Array("16","punktas"),_
										Array("17","punktas"),_
										Array("18","punktas"),_
										Array("19","punktas"),_
										Array("20","punktas"),_
										Array("21","punktas")_
									)_
								),_
								Array("2","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K11","LR diplomatinės tarnybos įstatymas",_
					Array(_
						Array("58","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas")_
									)_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas")_
									)_
								),_
								Array("3","dalis",Array()),_
								Array("5","dalis",Array()),_
								Array("9","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K12","LR teismų įstatymas",_
					Array(_
						Array("81","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas")_
									)_
								)_
							)_
						),_
						Array("82","straipsnis",Array()),_
						Array("90","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								),_
								Array("2","dalis",Array())_
							)_
						),_
						Array("91","straipsnis",Array())_
					)_
				),_
				Array("K13","LR prokuratūros istatymas",_
					Array(_
						Array("22","straipsnis",_
							Array(_
								Array("5","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas")_
									)_
								)_
							)_
						),_
						Array("44","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas")_
									)_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas")_
									)_
								)_
							)_
						),_
						Array("45","straipsnis",_
							Array(_
								Array("6","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K14","LR Konstitucinio Teismo įstatymas",_
					Array(_
						Array("11","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K15","LR Vyriausybės įstatymas",_
					Array(_
						Array("10","straipsnis",_
							Array(_
								Array("2","dalis",Array()),_
								Array("3","dalis",Array()),_
								Array("4","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K16","LR krašto apsaugos sistemos organizavimo ir KT įstatymas",_
					Array(_
						Array("37","straipsnis",_
							Array(_
								Array("1","dalis",Array())_
							)_
						),_
						Array("38","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas")_
									)_
								),_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas"),_
										Array("12","punktas"),_
										Array("13","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K17","LR Seimo kontrolierių įstatymas",_
					Array(_
						Array("9","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K18","LR valstybės kontrolės įstatymas",_
					Array(_
						Array("34","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						),_
						Array("35","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						),_
						Array("36","straipsnis",_
							Array(_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K19","LR moterų ir vyrų lygių galimybių įstatymas",_
					Array(_
						Array("15","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								),_
								Array("2","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K20","LR vaiko teisių apsaugos kontrolieriaus įstatymas",_
					Array(_
						Array("8","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K21","LR visuomenės informavimo įstatymas",_
					Array(_
						Array("49","straipsnis",_
							Array(_
								Array("8","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K22","LR vyriausiosios rinkimų komisijos įstatymas",_
					Array(_
						Array("10","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas"),_
										Array("10","punktas"),_
										Array("11","punktas")_
									)_
								),_
								Array("2","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K23","LR vyriausiosios tarnybinės etikos komisijos įstatymas",_
					Array(_
						Array("14","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K24","LR Lietuvos banko įstatymas",_
					Array(_
						Array("12","straipsnis",_
							Array(_
								Array("1","dalis",Array())_
							)_
						),_
						Array("13","straipsnis",_
							Array(_
								Array("1","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K25","LR finansinių priemonių rinkų įstatymas",_
					Array(_
						Array("70","straipsnis",_
							Array(_
								Array("4","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K26","LR azartinių lošimų įstatymas",_
					Array(_
						Array("26","straipsnis",_
							Array(_
								Array("4","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K27","LR energetikos įstatymas",_
					Array(_
						Array("17","straipsnis",_
							Array(_
								Array("4","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K28","LR konkurencijos įstatymas",_
					Array(_
						Array("20","straipsnis",_
							Array(_
								Array("3","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K29","LR draudimo įstatymas",_
					Array(_
						Array("182","straipsnis",_
							Array(_
								Array("7","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K30","LR mokesčių administravimo įstatymas",_
					Array(_
						Array("148","straipsnis",_
							Array(_
								Array("5","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K31","LR administracinių ginčų komisijų įstatymas",_
					Array(_
						Array("7","straipsnis",_
							Array(_
								Array("2","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K32","LR vietos savivaldos įstatymas",_
					Array(_
						Array("16","straipsnis",_
							Array(_
								Array("2","dalis",_
									Array(_
										Array("2","punktas")_
									)_
								)_
							)_
						),_
						Array("19","straipsnis",_
							Array(_
								Array("2","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas")_
									)_
								),_
								Array("3","dalis",Array()),_
								Array("4","dalis",Array()),_
								Array("5","dalis",Array()),_
								Array("6","dalis",Array()),_
								Array("7","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K33","LR savivaldybių tarybų rinkimų įstatymas",_
					Array(_
						Array("87","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas"),_
										Array("9","punktas")_
									)_
								),_
								Array("2","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K34","LR konstitucija",_
					Array(_
						Array("63","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas"),_
										Array("7","punktas"),_
										Array("8","punktas")_
									)_
								)_
							)_
						),_
						Array("84","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("11","punktas"),_
										Array("14","punktas")_
									)_
								)_
							)_
						),_
						Array("88","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						),_
						Array("108","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas")_
									)_
								)_
							)_
						),_
						Array("115","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas"),_
										Array("5","punktas"),_
										Array("6","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K99","Kitas teisės aktas",Array())_
			)_
		),_
		Array("17","savanoriška praktika",Array()),_
		Array("18","kursantas",Array()),_
		Array("19","darbuotojas, neturintis prievolės mokėti psd įmokų",Array()),_
		Array("20","kariūnas",Array()),_
		Array("21","eina narystės pagrindu renkamąsias/skiriamąsias pareigas",Array()),_
		Array("22","įgyta teisė nemokėti PSD įmokų arba nustatyta prievolė mokėti PSD",Array()),_
		Array("23","rinkimų ar referendumų komisijų nariai nuo 2022-01-01",Array()),_
		Array("96","darbo sutarties rūšies priskyrimas/pakeitimas",Array())_
	)
		
	ReasonList9SD = Array(_
	Array("01","tėvystės atostogos",Array()),_
	Array("02","atostogos vaikui prižiūrėti",Array()),_
	Array("03","atostogos vaikui prižiūrėti (DK 180 str. 2 d. iki 2017-06-30)",Array()),_
	Array("04","atostogos vaikui prižiūrėti (DK 134 str. 2 d. nuo 2017-07-01)",Array()),_
	Array("05","14 kalendorinių dienų atostogos (DK 132 str. 1d. nuo 2017-07-01)",Array()),_
	Array("06","tėvystės atostogos (DK 133 str. 2d. nuo 2018-01-01)",Array()),_
	Array("07","atostogos senelei (seneliui) vaikui prižiūrėti iki 3 metų",Array()),_
	Array("08","atostogos apdraustajai (įmotei) (DK 132 str. 2d.)",Array())_
	)
	
	ReasonList12SD = Array(_
		Array("01","nemokamos atostogos",Array()),_
		Array("02","atostogos kvalifikacijai tobulinti",Array()),_
		Array("03","kūrybinės atostogos",Array()),_
		Array("04","mokymosi atostogos",Array()),_
		Array("05","neatvykimas administracijos leidimu",Array()),_
		Array("06","atostogos vaikui prižiūrėti (kitiems giminaičiams)",Array()),_
		Array("07","išduota medicininė pažyma (forma Nr. 094/a)",Array()),_
		Array("08","nušalinimas nuo darbo (pareigų)",Array()),_
		Array("09","pravaikšta",Array()),_
		Array("10","karo tarnyba",Array())_
	)
	
	ReasonList13SD = Array(_
		Array("01","autorius, susijęs su draudėju darbo santykiais",Array()),_
		Array("02","autorius, nesusijęs su draudėju darbo santykiais",Array()),_
		Array("03","sportininkas, susijęs su draudėju darbo santykiais",Array()),_
		Array("04","sportininkas, nesusijęs su draudėju darbo santykiais",Array()),_
		Array("05","atlikėjas, susijęs su draudėju darbo santykiais",Array()),_
		Array("06","atlikėjas, nesusijęs su draudėju darbo santykiais",Array()),_
		Array("07","autorius, turintis meno kūrėjo statusą (iki 2016-12-31)",Array()),_
		Array("08","asmuo, gaunantis tantjemas",Array()),_
		Array("09","veiklos atlygis stebėtojų taryboje/valdyboje/paskolų komitete",Array()),_
		Array("10","nedraudžiamas PSD asmuo, gaunantis tantjemas/atlygį",Array()),_
		Array("11","asm., iš darbd. gaun. aut/sport/atlik. atlygį,kuriam netaik. SDĮ",Array()),_
		Array("12","nesusijęs su draudėju autorius/sportininkas/atlikėjas be PSD",Array())_
	)
	
	ReasonListSAM3SDP = Array(_
		Array("01","valstybės tarnautojas/darbuotojas, gaunantis kompensaciją",Array()),_
		Array("02","karys savanoris ir aktyviojo rezervo karys",Array()),_
		Array("03","nuteistasis/asmuo, esantis social. ir psichol. reabil. įstaigoje",Array()),_
		Array("04","savivaldybės tarybos narys",Array()),_
		Array("05","asmuo, pašauktas į jaunesniųjų karininkų vadų mokymus",Array()),_
		Array("06","mažosios bendrijos vadovas",Array()),_		
		Array("07","medicinos ekspertas/specialistas",Array()),_
		Array("08","išmoką apsk. draudėjas, nesusijęs su asm. darbo santykiais",Array()),_
		Array("09","asmuo, atlyg. einantis renk./skiriam. pareigas nuo 2022-01-01",Array()),_
		Array("10","nedraud. PSD asmuo, einant. renk./skiriam. pareig. nuo 2022-01-01",Array())_
	)
	
	ReasonListNPSD = Array(_
		Array("01","neturi stažo",Array()),_
		Array("02","dirbo ir neprarado pajamų",Array()),_
		Array("03","nesutapo su darbo grafiku",Array()),_
		Array("04","pateiktas tęsinys",Array()),_
		Array("05","kiti atvejai",Array())_
	)
	
	ReasonListNPSD2 = Array(_
		Array("01","neturi stažo",Array()),_
		Array("02","dirbo ir neprarado pajamų",Array()),_
		Array("03","nesutapo su darbo grafiku",Array()),_
		Array("04","pateiktas tęsinys",Array()),_
		Array("05","sutapo su nedraudiminiu laikotarpiu",Array()),_
		Array("06","kitos priežastys (įrašyti)",Array())_
	)
	
	ReasonMisc = "99"
	ReasonMisc1SD = "99"
	ReasonMisc2SD = "99"
	ReasonMisc12SD = "99"
	ReasonMisc13SD = "99"
	ReasonMiscSAM3SDP = "99"
	ReasonMiscNPSD = "05"
	ReasonMiscNPSD2 = "06"
		
	FormDefs = Array("PT","PT-1-SD","PT-2-SD","PT-9-SD","PT-12-SD","PT-13-SD","PT-SAM3SD","PT-SAM3SDP","PT-NP-SD", "PT-SAM3SD-M","PT-NP-SD2")
	FormVersion = "15"

	HeaderFieldsReq = Array("InsurerName", "InsurerAddress")
	FooterFieldsReq = Array("ManagerFullName", "PreparatorDetails")
	RowFieldsReqCommon = Array("PersonFirstName_","PersonLastName_")
	RowFieldsReqCommonNPSD = Array("PersonFirstName_","PersonLastName_")
	RowFieldsReq1SD = Array("InsuranceStartDate_","ReasonCode_")
	RowFieldsReq1SD_2 = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_")
	RowFieldsReq2SD = Array("InsuranceEndDate_","ReasonCode_")
	RowFieldsReq2SD_2 = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_") 
	RowFieldsReq9SD = Array("HolidayStartDate_","HolidayEndDate_", "ChildBirthDate_","ReasonCode_")
	RowFieldsReq9SD_2 = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_")
	RowFieldsReq12SD = Array("InsuranceSuspendStart_","InsuranceSuspendEnd_","ReasonCode_")
	RowFieldsReq12SD_2 = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_")
	RowFieldsReq13SD = Array("InsuranceStartDate_","ReasonCode_")
	RowFieldsReq13SD_2 = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_")
	
	RowFieldsReqSAM3SD = Array("InsIncomeSum_","PaymentSum_", "Currency_")
	RowFieldsReqSAM3SD_2 = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_")
	RowFieldsReqSAM3SDP = Array("PeriodStartDate_","PeriodEndDate_","InsIncomeSum_","ReasonCode_")
	RowFieldsReqSAM3SDP_2 = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_")
	RowFieldsReqSAM3SDM = Array("InsIncomeSum_2_")
	RowFieldsReqSAM3SDM_2 = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_")
	RowFieldsReqNPSD = Array("PersonFirstName_","PersonLastName_")
	RowFieldsReqNPSD_2 = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_")
	RowFieldsReqPeriod = Array("RevisedCycleYear","RevisedCycleMonth")

	'RowFieldsAll1SD = Array("InsuranceStartDate_", "ReasonCode_", "ReasonDetCode_")
	RowFieldsAll1SD = Array("InsuranceStartDate_", "ReasonCode_", "ReasonDetCode_","ReasonDetTypeCode_","PersonProfession_1_", "PersonProfession_2_", "PersonProfession_3_", "PersonProfession_4_")
	RowFieldsAll2SD = Array("InsuranceEndDate_", "InsIncomeSum_","TaxRate_", "PaymentSum_", "ReasonCode_", "ReasonDetCode_", "LawActArticle_", "LawActPart_", "LawActSubsection_", "CompensatedMonthsCount_", "Currency_")
	RowFieldsAll9SD = Array("HolidayStartDate_", "HolidayEndDate_", "HolidayCancelDate_", "ChildBirthDate_", "ChildPersonCode_","ReasonCode_")
	RowFieldsAll12SD = Array("InsuranceSuspendStart_", "InsuranceSuspendEnd_", "ReasonCode_")
	RowFieldsAll13SD = Array("InsuranceStartDate_", "InsIncomeSum_","TaxRate_","PaymentSum_", "ReasonCode_", "Currency_")
	RowFieldsAllSAM3SD = Array("InsIncomeSum_","TaxRate_","PaymentSum_", "Currency_")
	RowFieldsAllSAM3SDM = Array("InsIncomeSum_","TaxRate_","PaymentSum_")
	RowFieldsAllSAM3SDP = Array("PeriodStartDate_", "PeriodEndDate_", "InsIncomeSum_","TaxRate_","PaymentSum_", "ReasonCode_", "Currency_")
	RowFieldsAllNPSD = Array("A5_Series_", "A8_Series_", "A6_Start_", "A7_End_", "A9_Start_", "A10_End_", "B11_Start_", "B12_End_", "B21_Start_", "B31_Start_", "B32_End_", "B41_Start_", "B42_End_", "B51_PaymentSum_", "ReasonCode_")
End Sub

Sub ValidateHeader(Fields)
	If CompleteFieldSet(Fields, GetFieldNames(HeaderFieldsReq, 0), False) then
		if not (Fields.ItemByName("JuridicalPersonCode").value = "") then
			Call validateJuridicalCode(Fields.ItemByName("JuridicalPersonCode"))
		end if
		'Call validateInsurerCode(Fields.ItemByName("InsurerCode"))
	Else
		form.setError "Turi būti įvesti draudėjo duomenys", GetFieldObjects(Fields, HeaderFieldsReq, 0), EL_ERROR
	end if
	If Not CompleteFieldSetAny(Fields, GetFieldNames(Array("InsurerCode","JuridicalPersonCode"), 0)) then
		form.setError "Turi būti nurodytas draudėjo ir/arba juridinio asmens kodas", GetFieldObjects(Fields, Array("InsurerCode","JuridicalPersonCode"), 0), EL_ERROR
	end if
	if Not Fields.ItemByName("InsurerPhone").value = "" then
		Call validateInsurerPhone(Fields.ItemByName("InsurerPhone"))
	end if
	'if (Fields.ItemByName("RecipientDepName").value = "") then
	'	form.setError "Turi būti nurodytas teritorinis skyrius", Array(Fields.ItemByName("RecipientDepName")), EL_ERROR
	'end if
End Sub

Sub ValidateFooter(Fields)
	If not CompleteFieldSet(Fields, GetFieldNames(FooterFieldsReq, 0), False) then
		form.setError "Turi būti įvesti vadovo ir rengėjo duomenys", GetFieldObjects(Fields, FooterFieldsReq, 0), EL_ERROR
	end if
End sub

Function ValidateMainPage(FormFields)
	ValidateMainPage = True
	
	if formFields.ItemByName("ReasonCode_1").value = "" or formFields.ItemByName("ReasonText_1").value = "" then form.setError "Neįvesta duomenų tikslinimo priežastis", Array(FormFields.ItemByName("ReasonCode_1"), FormFields.ItemByName("ReasonText_1")), EL_ERROR
	if formFields.ItemByName("PTFormCode").value = "" then form.setError "Pasirinkite tikslinamą pranešimą ir pridėkite jo priedą", Array(FormFields.ItemByName("PTFormCode")), EL_ERROR
	FormFields.ItemByName("InsIncomeSumDiff").setCheckValue ""
	FormFields.ItemByName("PaymentSumDiff").setCheckValue ""
	Select case formFields.ItemByName("PTFormCode").value
		case "1-SD"
			ValidateMainPage = ValidateMainPage and ValidateTitleRow(FormFields, "PT-1-SD", 1)
		case "2-SD"
			ValidateMainPage = ValidateMainPage and ValidateTitleRow(FormFields, "PT-2-SD", 2)
		case "9-SD"
			ValidateMainPage = ValidateMainPage and ValidateTitleRow(FormFields, "PT-9-SD", 3)
		case "12-SD"
			ValidateMainPage = ValidateMainPage and ValidateTitleRow(FormFields, "PT-12-SD", 4)
		case "13-SD"
			ValidateMainPage = ValidateMainPage and ValidateTitleRow(FormFields, "PT-13-SD", 5)
		case "SAM3SD"
			ValidateMainPage = ValidateMainPage and ValidateTitleRow(FormFields, "PT-SAM3SD", 6)
		case "SAM3SDP"
			ValidateMainPage = ValidateMainPage and ValidateTitleRow(FormFields, "PT-SAM3SDP", 7)
		case "NP-SD"
			ValidateMainPage = ValidateMainPage and ValidateTitleRow(FormFields, "PT-NP-SD", 8)
		case "SAM3SD-M"
			ValidateMainPage = ValidateMainPage and ValidateTitleRow(FormFields, "PT-SAM3SD-M", 9)
		case "NP-SD2"
			ValidateMainPage = ValidateMainPage and ValidateTitleRow(FormFields, "PT-NP-SD2", 10)
	End Select
	
End Function

Function ValidateTitleRow(FormFields, FormDefName, RowNum)
	dim pageCount
	
	ValidateTitleRow = true
	pageCount = GetPageCount(Array(FormDefName))
	if pageCount = 0 and Not FormFields.ItemByName("PTFormCode").value = "" then
		form.setError "Pridėkite priedą "&FormDefName, Array(FormFields.ItemByName("PTFormCode")), EL_ERROR
		ValidateTitleRow = false
	end if
	if pageCount > 0 and FormFields.ItemByName("PTFormCode").value = Right(FormDefName, Len(FormDefName) - InStr(FormDefName, "-")) then
		'form.setError "Pasirinkite priedą "&FormDefName&" arba pašalinkite jį", Array(FormFields.ItemByName("PTFormCode")), EL_ERROR
		Call ValidatePTFormCode(FormFields, "PT-1-SD")
		Call ValidatePTFormCode(FormFields, "PT-2-SD")
		Call ValidatePTFormCode(FormFields, "PT-9-SD")
		Call ValidatePTFormCode(FormFields, "PT-12-SD")
		Call ValidatePTFormCode(FormFields, "PT-13-SD")
		Call ValidatePTFormCode(FormFields, "PT-SAM3SD")
		Call ValidatePTFormCode(FormFields, "PT-SAM3SDP")
		Call ValidatePTFormCode(FormFields, "PT-NP-SD")
		Call ValidatePTFormCode(FormFields, "PT-SAM3SD-M")
		Call ValidatePTFormCode(FormFields, "PT-NP-SD2")
		'ValidateTitleRow = false
	end if
End Function

Function ValidatePTFormCode(FormFields, FormDefName)
	dim pageCount
	
	ValidatePTFormCode = true
	pageCount = GetPageCount(Array(FormDefName))
	if pageCount > 0 and Not FormFields.ItemByName("PTFormCode").value = Right(FormDefName, Len(FormDefName) - InStr(FormDefName, "-")) then
		form.setError "Pildykite tik tikslinamo SD pranešimo priedą. Kitus priedus pašalinkite "&FormDefName, Array(FormFields.ItemByName("PTFormCode")), EL_ERROR
		ValidatePTFormCode = false
	'elseif pageCount = 0 and FormFields.ItemByName("PTFormCode").value = Right(FormDefName, 4) then
	'	form.setError "Pasirinkite priedą "&FormDefName&" arba įterpkite jį", Array(FormFields.ItemByName("PTFormCode")), EL_ERROR
	'	ValidatePTFormCode = false
	end if
End Function

Function ValidateEqual (FormFields, Fields, RowNum1, RowNum2)
	dim i

	for i=0 to ubound(Fields)
		if FormFields.ItemByName(Fields(i)&RowNum1).value = FormFields.ItemByName(Fields(i)&RowNum2).value then
			ValidateEqual = True
		else
			ValidateEqual = False
			Exit Function
		end if
	next
	form.setError "Pranešimas neteisingas, skiltyse ""Registro duomenys"" ir ""Nurodomi teisingi duomenys"" nurodyti duomenys yra tapatūs", GetFieldObjects(formFields, Fields, 2), EL_ERROR

End Function

Function ValidateEqual2Lists (FormFields, Fields1, Fields2)
	dim i

	for i=0 to ubound(Fields1)
		if InStr(Fields1(i),"Number")>0 then
			if CustCdbl(FormFields.ItemByName(Fields1(i))) = CustCdbl(FormFields.ItemByName(Fields2(i))) then
				ValidateEqual2Lists = True
			else
				ValidateEqual2Lists = False
				Exit Function
			end if
		else
			if FormFields.ItemByName(Fields1(i)).value = FormFields.ItemByName(Fields2(i)).value then
				ValidateEqual2Lists = True
			else
				ValidateEqual2Lists = False
				Exit Function
			end if
		end if
	next
	form.setError "Pranešimas neteisingas, skiltyse ""Registro duomenys"" ir ""Nurodomi teisingi duomenys"" nurodyti duomenys yra tapatūs", GetFieldObjects(formFields, Fields2, 0), EL_ERROR

End Function

Function RecalcBody1SD
	dim formFields
	dim i, j, c
	dim RowNum, PageNum, rsnCode, pageCount, RowNumDel
	
	pageCount = ACount(FormDefs(1))
	for i = 1 to pageCount
		set formFields = form.getpagesForTemplate(FormDefs(1)).Item(i).fields
		
		if formFields.ItemByName("ReasonCode_2").value = "18" then
			RowNum = 2
			FormFields.ItemByName("ReasonDetCode_"&RowNum).SetCheckValue("")
			FormFields.ItemByName("ReasonDetText_"&RowNum).SetCheckValue("")
		end if
		
		if ValidateRowCommon(formFields, 1) then
			if FormFields.ItemByName("U1Group").value <> -1 then
				if FormFields.ItemByName("U1Group").value = 1 then
					if FormFields.ItemByName("PersonBirthDate_1").value <> "" then 
						form.setError "Jeigu pažymėtas U1.1 laukas, tai A2.1 laukas turi būti neužpildytas "&i&" lapo 1 eilutėje", GetFieldObjects(FormFields, Array("U1Group","PersonBirthDate_1"), 0), EL_ERROR
					end if
				elseif FormFields.ItemByName("U1Group").value = 2 then
					if FormFields.ItemByName("PersonBirthDate_1").value = "" then 
						form.setError "Jeigu pažymėtas U1.2 laukas, tai A2.1 laukas turi būti užpildytas "&i&" lapo 1 eilutėje", GetFieldObjects(FormFields, Array("U1Group","PersonBirthDate_1"), 0), EL_ERROR
					end if
				end if
			end if
			
			if FormFields.ItemByName("PersonForeignCode_1").value <> "" then
				if len(FormFields.ItemByName("PersonForeignCode_1").value) < 11 then
					form.setError "Asmens užsieniečio kodo ilgis turi būti 11 skaitmenų "&i&" lapo 1 eilutėje", GetFieldObjects(FormFields, Array("PersonForeignCode_1"), 0), EL_ERROR
				end if
				if Left(FormFields.ItemByName("PersonForeignCode_1").value,1) <> "9" then
					form.setError "Asmens užsieniečio kodo pirmasis simbolis turi būti skaičius 9 "&i&" lapo 1 eilutėje", GetFieldObjects(FormFields, Array("PersonForeignCode_1"), 0), EL_ERROR
				end if
			end if
		
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "2" then
				RowNum = 1 
				if formFields.ItemByName("InsuranceStartDate_"&RowNum).value = "" AND formFields.ItemByName("ReasonCode_"&RowNum).value = "" AND formFields.ItemByName("ReasonText_"&RowNum).value = "" AND formFields.ItemByName("ReasonDetCode_"&RowNum).value = "" AND formFields.ItemByName("ReasonDetText_"&RowNum).value = "" AND formFields.ItemByName("ReasonDetTypeCode_"&RowNum).value = "" AND formFields.ItemByName("ReasonDetTypeText_"&RowNum).value = "" then
					form.setError "Tikslinant arba šalinant duomenis, visi laukai, esantys lentelėje REGISTRO DUOMENYS, negali būti tušti. Laukus galima užpildyti paspaudus mygtuką ""Užpildyti registro duomenis""", GetFieldObjects(formFields, Array("InsuranceStartDate_"&RowNum, "ReasonCode_"&RowNum, "ReasonText_"&RowNum, "ReasonDetCode_"&RowNum, "ReasonDetText_"&RowNum, "ReasonDetTypeCode_"&RowNum, "ReasonDetTypeText_"&RowNum), 0), EL_ERROR
				end if
			end if
			if formFields.ItemByName("PTActionGroup").value = "1" then
				'patikslinti
				PageNum = i
				RowNum = 2
				Call ValidateRow1SD(formFields, PageNum, RowNum)
			end if
			if formFields.ItemByName("PTActionGroup").value = "2" then
				'pašalinti
				RowNumDel = 2
				Call formFields.ItemByName("InsuranceStartDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonDetCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonDetText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonDetTypeCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonDetTypeText_"&RowNumDel).SetCheckValue("")
			end if
			if formFields.ItemByName("PTActionGroup").value = "3" then
				'naujai įrašyti
				PageNum = i
				RowNumDel = 1
				RowNum = 2
				Call formFields.ItemByName("InsuranceStartDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonDetCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonDetText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonDetTypeCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonDetTypeText_"&RowNumDel).SetCheckValue("")
				Call ValidateRow1SD(formFields, PageNum, RowNum)
			end if
		end if
		Call ValidateEqual(formFields, RowFieldsAll1SD, 1, 2)
		
	next
End Function

Function RecalcBody2SD
	dim formFields, FormFields0
	dim i, j, c, before, after, InsIncomeSumDiff, PaymentSumDiff
	dim RowNum, PageNum, rsnCode, pageCount, RowNumDel, FieldName, DateType, FormType
	dim PageCurrency
	
	pageCount = ACount(FormDefs(2))
	set FormFields0 = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	FormFields0.ItemByName("InsIncomeSumDiff").setCheckValue("")
	FormFields0.ItemByName("PaymentSumDiff").setCheckValue("")
	
	PageCurrency = ""
	for i = 1 to pageCount
		set formFields = form.getpagesForTemplate(FormDefs(2)).Item(i).fields
		
		if formFields.ItemByName("ReasonCode_2").value = "17" or formFields.ItemByName("ReasonCode_2").value = "18" or formFields.ItemByName("ReasonCode_2").value = "20" then
			RowNum = 2
			FormFields.ItemByName("InsIncomeSum_"&RowNum).SetCheckValue("")
			FormFields.ItemByName("TaxRate_"&RowNum).SetCheckValue("")
			FormFields.ItemByName("PaymentSum_"&RowNum).SetCheckValue("")
			FormFields.ItemByName("ReasonDetCode_"&RowNum).SetCheckValue("")
			FormFields.ItemByName("ReasonDetText_"&RowNum).SetCheckValue("")
			FormFields.ItemByName("LawActArticle_"&RowNum).SetCheckValue("")
			FormFields.ItemByName("LawActPart_"&RowNum).SetCheckValue("")
			FormFields.ItemByName("LawActSubsection_"&RowNum).SetCheckValue("")
			FormFields.ItemByName("CompensatedMonthsCount_"&RowNum).SetCheckValue("")
		end if
		
		if formFields.ItemByName("ReasonCode_2").value = "10" or _
		  formFields.ItemByName("ReasonCode_2").value = "11" or _
		  formFields.ItemByName("ReasonCode_2").value = "12" or _
		  formFields.ItemByName("ReasonCode_2").value = "13" then
		  RowNum = 2
		  FormFields.ItemByName("InsIncomeSum_"&RowNum).SetCheckValue("")
			FormFields.ItemByName("TaxRate_"&RowNum).SetCheckValue("")
		  FormFields.ItemByName("PaymentSum_"&RowNum).SetCheckValue("")
		end if
		
		before = CustCdbl(FormFields.ItemByName("InsIncomeSum_1"))
		after = CustCdbl(FormFields.ItemByName("InsIncomeSum_2"))
		InsIncomeSumDiff = CustCdbl(FormFields0.ItemByName("InsIncomeSumDiff"))
		FormFields0.ItemByName("InsIncomeSumDiff").setCheckValue(Form.FormatDecimal(InsIncomeSumDiff+after-before))
		before = CustCdbl(FormFields.ItemByName("PaymentSum_1"))
		after = CustCdbl(FormFields.ItemByName("PaymentSum_2"))
		PaymentSumDiff = CustCdbl(FormFields0.ItemByName("PaymentSumDiff"))
		FormFields0.ItemByName("PaymentSumDiff").setCheckValue(Form.FormatDecimal(PaymentSumDiff+after-before))
		
		FieldName = "InsuranceEndDate_"
		DateType = "D"
		
		if ValidateRowCommon(formFields, 1) then
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "2" then
				RowNum = 1
				if formFields.ItemByName("InsuranceEndDate_"&RowNum).value = "" AND formFields.ItemByName("InsIncomeSum_"&RowNum).value = "" AND formFields.ItemByName("TaxRate_"&RowNum).value = "" AND formFields.ItemByName("PaymentSum_"&RowNum).value = "" AND formFields.ItemByName("ReasonCode_"&RowNum).value = "" AND formFields.ItemByName("ReasonText_"&RowNum).value = "" AND formFields.ItemByName("ReasonDetCode_"&RowNum).value = "" AND formFields.ItemByName("ReasonDetText_"&RowNum).value = "" AND formFields.ItemByName("LawActArticle_"&RowNum).value = "" AND formFields.ItemByName("LawActPart_"&RowNum).value = "" AND formFields.ItemByName("LawActSubsection_"&RowNum).value = "" AND formFields.ItemByName("CompensatedMonthsCount_"&RowNum).value = "" then
					form.setError "Tikslinant arba šalinant duomenis, visi laukai, esantys lentelėje REGISTRO DUOMENYS, negali būti tušti. Laukus galima užpildyti paspaudus mygtuką ""Užpildyti registro duomenis""", GetFieldObjects(formFields, Array("InsuranceEndDate_"&RowNum, "InsIncomeSum_"&RowNum, "TaxRate_"&RowNum, "PaymentSum_"&RowNum, "ReasonCode_"&RowNum, "ReasonText_"&RowNum, "ReasonDetCode_"&RowNum, "ReasonDetText_"&RowNum, "LawActArticle_"&RowNum, "LawActPart_"&RowNum, "LawActSubsection_"&RowNum, "CompensatedMonthsCount_"&RowNum, "Currency_"&RowNum), 0), EL_ERROR
				end if
			end if
			if formFields.ItemByName("PTActionGroup").value = "1" then
				'patikslinti
				RowNum = 2
				PageNum = i
				Call ValidateRow2SD(formFields, PageNum, RowNum)
				'Uzdedam valiuta
				Call SetCurrency(formFields, RowNum, FieldName, DateType, FormType)
			end if
			if formFields.ItemByName("PTActionGroup").value = "2" then
				'pašalinti
				RowNumDel = 2
				Call formFields.ItemByName("InsuranceEndDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("InsIncomeSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("TaxRate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("PaymentSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonDetCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonDetText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("LawActArticle_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("LawActPart_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("LawActSubsection_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("CompensatedMonthsCount_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("Currency_"&RowNumDel).SetCheckValue("")
			end if
			if formFields.ItemByName("PTActionGroup").value = "3" then
				'naujai įrašyti
				RowNumDel = 1
				RowNum = 2
				PageNum = i
				Call formFields.ItemByName("InsuranceEndDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("InsIncomeSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("TaxRate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("PaymentSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonDetCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonDetText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("LawActArticle_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("LawActPart_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("LawActSubsection_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("CompensatedMonthsCount_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("Currency_"&RowNumDel).SetCheckValue("")
				Call ValidateRow2SD(formFields, PageNum, RowNum)
				'Uzdedam valiuta
				Call SetCurrency(formFields, RowNum, FieldName, DateType, FormType)
			end if
		end if
		Call ValidateEqual(formFields, RowFieldsAll2SD, 1, 2)
		
		if i <> 1 then
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "3" then
				if formFields.ItemByName("Currency_2").value <> "" then
					if formFields.ItemByName("Currency_2").value <> PageCurrency then
						form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_2")), EL_ERROR
					end if
				end if
			elseif formFields.ItemByName("PTActionGroup").value = "2" then
				if formFields.ItemByName("Currency_1").value <> "" then
					if formFields.ItemByName("Currency_1").value <> PageCurrency then
						form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_1")), EL_ERROR
					end if
				end if
			end if
		end if
			
		if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "3" then
			if formFields.ItemByName("Currency_2").value <> "" and PageCurrency = "" then
				PageCurrency = formFields.ItemByName("Currency_2").value
			end if
		elseif formFields.ItemByName("PTActionGroup").value = "2" then
			if formFields.ItemByName("Currency_1").value <> "" and PageCurrency = "" then
				PageCurrency = formFields.ItemByName("Currency_1").value
			end if
		end if
		
	next
End Function

Function RecalcBody9SD
	dim formFields
	dim i, j, c
	dim RowNum, PageNum, rsnCode, pageCount, RowNumDel
	
	pageCount = ACount(FormDefs(3))
	for i = 1 to pageCount
		set formFields = form.getpagesForTemplate(FormDefs(3)).Item(i).fields
		if ValidateRowCommon(formFields, 1) then
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "2" then
				RowNum = 1
				if formFields.ItemByName("HolidayStartDate_"&RowNum).value = "" AND formFields.ItemByName("HolidayEndDate_"&RowNum).value = "" AND formFields.ItemByName("HolidayCancelDate_"&RowNum).value = "" AND formFields.ItemByName("ChildBirthDate_"&RowNum).value = "" AND formFields.ItemByName("ChildPersonCode_"&RowNum).value = "" and formFields.ItemByName("ReasonCode_"&RowNum).value = "" AND formFields.ItemByName("ReasonText_"&RowNum).value = "" then
					form.setError "Tikslinant arba šalinant duomenis, visi laukai, esantys lentelėje REGISTRO DUOMENYS, negali būti tušti. Laukus galima užpildyti paspaudus mygtuką ""Užpildyti registro duomenis""", GetFieldObjects(formFields, Array("HolidayStartDate_"&RowNum, "HolidayEndDate_"&RowNum, "HolidayCancelDate_"&RowNum, "ChildBirthDate_"&RowNum, "ChildPersonCode_"&RowNum,"ReasonCode_"&RowNum,"ReasonText_"&RowNum), 0), EL_ERROR
				end if
			end if
			if formFields.ItemByName("PTActionGroup").value = "1" then
				'patikslinti
				RowNum = 2
				PageNum = i
				Call ValidateRow9SD(formFields, PageNum, RowNum)
			end if
			if formFields.ItemByName("PTActionGroup").value = "2" then
				'pašalinti
				RowNumDel = 2
				Call formFields.ItemByName("HolidayStartDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("HolidayEndDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("HolidayCancelDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ChildBirthDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ChildPersonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
			end if
			if formFields.ItemByName("PTActionGroup").value = "3" then
				'naujai įrašyti
				RowNumDel = 1
				RowNum = 2
				PageNum = i
				Call formFields.ItemByName("HolidayStartDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("HolidayEndDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("HolidayCancelDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ChildBirthDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ChildPersonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
				Call ValidateRow9SD(formFields, PageNum, RowNum)
			end if
		end if
		Call ValidateEqual(formFields, RowFieldsAll9SD, 1, 2)
	next
End Function

Function RecalcBody12SD
	dim formFields
	dim i, j, c
	dim RowNum, PageNum, rsnCode, pageCount, RowNumDel
	
	pageCount = ACount(FormDefs(4))
	for i = 1 to pageCount
		set formFields = form.getpagesForTemplate(FormDefs(4)).Item(i).fields
		if ValidateRowCommon(formFields, 1) then
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "2" then
				RowNum = 1
				if formFields.ItemByName("InsuranceSuspendStart_"&RowNum).value = "" AND formFields.ItemByName("InsuranceSuspendEnd_"&RowNum).value = "" AND formFields.ItemByName("ReasonCode_"&RowNum).value = "" AND formFields.ItemByName("ReasonText_"&RowNum).value = "" then
					form.setError "Tikslinant arba šalinant duomenis, visi laukai, esantys lentelėje REGISTRO DUOMENYS, negali būti tušti. Laukus galima užpildyti paspaudus mygtuką ""Užpildyti registro duomenis""", GetFieldObjects(formFields, Array("InsuranceSuspendStart_"&RowNum, "InsuranceSuspendEnd_"&RowNum, "ReasonCode_"&RowNum, "ReasonText_"&RowNum), 0), EL_ERROR
				end if
			end if
			if formFields.ItemByName("PTActionGroup").value = "1" then
				'patikslinti
				PageNum = i
				RowNum = 2
				Call ValidateRow12SD(formFields, PageNum, RowNum)
			end if
			if formFields.ItemByName("PTActionGroup").value = "2" then
				'pašalinti
				RowNumDel = 2
				Call formFields.ItemByName("InsuranceSuspendStart_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("InsuranceSuspendEnd_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
			end if
			if formFields.ItemByName("PTActionGroup").value = "3" then
				'naujai įrašyti
				RowNumDel = 1
				RowNum = 2
				PageNum = i
				Call formFields.ItemByName("InsuranceSuspendStart_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("InsuranceSuspendEnd_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
				Call ValidateRow12SD(formFields, PageNum, RowNum)
			end if
		end if
		Call ValidateEqual(formFields, RowFieldsAll12SD, 1, 2)
	next
End Function

Function RecalcBody13SD
	dim formFields, FormFields0
	dim i, j, c, before, after, InsIncomeSumDiff, PaymentSumDiff
	dim RowNum, PageNum, rsnCode, pageCount, RowNumDel, FieldName, DateType, FormType
	dim PageCurrency
	
	pageCount = ACount(FormDefs(5))
	set FormFields0 = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	FormFields0.ItemByName("InsIncomeSumDiff").setCheckValue("")
	FormFields0.ItemByName("PaymentSumDiff").setCheckValue("")
	
	PageCurrency = ""
	for i = 1 to pageCount
		set formFields = form.getpagesForTemplate(FormDefs(5)).Item(i).fields
		before = CustCdbl(FormFields.ItemByName("InsIncomeSum_1"))
		after = CustCdbl(FormFields.ItemByName("InsIncomeSum_2"))
		InsIncomeSumDiff = CustCdbl(FormFields0.ItemByName("InsIncomeSumDiff"))
		FormFields0.ItemByName("InsIncomeSumDiff").setCheckValue(Form.FormatDecimal(InsIncomeSumDiff+after-before))
		before = CustCdbl(FormFields.ItemByName("PaymentSum_1"))
		after = CustCdbl(FormFields.ItemByName("PaymentSum_2"))
		PaymentSumDiff = CustCdbl(FormFields0.ItemByName("PaymentSumDiff"))
		FormFields0.ItemByName("PaymentSumDiff").setCheckValue(Form.FormatDecimal(PaymentSumDiff+after-before))
		
		FieldName = "InsuranceStartDate_"
		DateType = "D"
		
		if ValidateRowCommon(formFields, 1) then
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "2" then
				RowNum = 1
				if formFields.ItemByName("InsuranceStartDate_"&RowNum).value = "" AND formFields.ItemByName("InsIncomeSum_"&RowNum).value = "" AND formFields.ItemByName("TaxRate_"&RowNum).value = "" AND formFields.ItemByName("PaymentSum_"&RowNum).value = "" AND formFields.ItemByName("ReasonCode_"&RowNum).value = "" AND formFields.ItemByName("ReasonText_"&RowNum).value = "" then
					form.setError "Tikslinant arba šalinant duomenis, visi laukai, esantys lentelėje REGISTRO DUOMENYS, negali būti tušti. Laukus galima užpildyti paspaudus mygtuką ""Užpildyti registro duomenis""", GetFieldObjects(formFields, Array("InsuranceStartDate_"&RowNum, "InsIncomeSum_"&RowNum, "TaxRate_"&RowNum, "PaymentSum_"&RowNum, "ReasonCode_"&RowNum, "ReasonText_"&RowNum, "Currency_"&RowNum), 0), EL_ERROR
				end if
			end if
			if formFields.ItemByName("PTActionGroup").value = "1" then
				'patikslinti
				PageNum = i
				RowNum = 2
				Call ValidateRow13SD(formFields, PageNum, RowNum)
				'Uzdedam valiuta
				Call SetCurrency(formFields, RowNum, FieldName, DateType, FormType)
			end if
			if formFields.ItemByName("PTActionGroup").value = "2" then
				'pašalinti
				RowNumDel = 2
				Call formFields.ItemByName("InsuranceStartDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("InsIncomeSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("TaxRate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("PaymentSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("Currency_"&RowNumDel).SetCheckValue("")				
			end if
			if formFields.ItemByName("PTActionGroup").value = "3" then
				'naujai įrašyti
				RowNumDel = 1
				RowNum = 2
				PageNum = i
				Call formFields.ItemByName("InsuranceStartDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("InsIncomeSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("TaxRate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("PaymentSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("Currency_"&RowNumDel).SetCheckValue("")
				Call ValidateRow13SD(formFields, PageNum, RowNum)
				'Uzdedam valiuta
				Call SetCurrency(formFields, RowNum, FieldName, DateType, FormType)
			end if
		end if
		Call ValidateEqual(formFields, RowFieldsAll13SD, 1, 2)
		
		if i <> 1 then
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "3" then
				if formFields.ItemByName("Currency_2").value <> "" then
					if formFields.ItemByName("Currency_2").value <> PageCurrency then
						form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_2")), EL_ERROR
					end if
				end if
			elseif formFields.ItemByName("PTActionGroup").value = "2" then
				if formFields.ItemByName("Currency_1").value <> "" then
					if formFields.ItemByName("Currency_1").value <> PageCurrency then
						form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_1")), EL_ERROR
					end if
				end if
			end if
		end if
			
		if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "3" then
			if formFields.ItemByName("Currency_2").value <> "" and PageCurrency = "" then
				PageCurrency = formFields.ItemByName("Currency_2").value
			end if
		elseif formFields.ItemByName("PTActionGroup").value = "2" then
			if formFields.ItemByName("Currency_1").value <> "" and PageCurrency = "" then
				PageCurrency = formFields.ItemByName("Currency_1").value
			end if
		end if
		
	next
End Function

Function RecalcBodySAM3SD
	dim formFields, FormFields0
	dim i, j, c, before, after, InsIncomeSumDiff, PaymentSumDiff
	dim RowNum, PageNum, rsnCode, pageCount, RowNumDel, FieldName, DateType, FormType
	dim PageCurrency
	
	pageCount = ACount(FormDefs(6))
	set FormFields0 = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	FormFields0.ItemByName("InsIncomeSumDiff").setCheckValue("")
	FormFields0.ItemByName("PaymentSumDiff").setCheckValue("")
	
	PageCurrency = ""
	for i = 1 to pageCount
		set formFields = form.getpagesForTemplate(FormDefs(6)).Item(i).fields
		before = CustCdbl(FormFields.ItemByName("InsIncomeSum_1"))
		after = CustCdbl(FormFields.ItemByName("InsIncomeSum_2"))
		InsIncomeSumDiff = CustCdbl(FormFields0.ItemByName("InsIncomeSumDiff"))
		FormFields0.ItemByName("InsIncomeSumDiff").setCheckValue(Form.FormatDecimal(InsIncomeSumDiff+after-before))
		before = CustCdbl(FormFields.ItemByName("PaymentSum_1"))
		after = CustCdbl(FormFields.ItemByName("PaymentSum_2"))
		PaymentSumDiff = CustCdbl(FormFields0.ItemByName("PaymentSumDiff"))
		FormFields0.ItemByName("PaymentSumDiff").setCheckValue(Form.FormatDecimal(PaymentSumDiff+after-before))
		
		FieldName = "RevisedCycleYear"
		DateType = "Y"
		FormType = "PT-SAM3SD"
		
		if ValidateRowCommon(formFields, 1) then
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "2" then
				RowNum = 1
				if formFields.ItemByName("InsIncomeSum_"&RowNum).value = "" AND formFields.ItemByName("PaymentSum_"&RowNum).value = "" AND formFields.ItemByName("TaxRate_"&RowNum).value = "" then
					form.setError "Tikslinant arba šalinant duomenis, visi laukai, esantys lentelėje REGISTRO DUOMENYS, negali būti tušti. Laukus galima užpildyti paspaudus mygtuką ""Užpildyti registro duomenis""", GetFieldObjects(formFields, Array("InsIncomeSum_"&RowNum, "TaxRate_"&RowNum, "PaymentSum_"&RowNum, "Currency_"&RowNum), 0), EL_ERROR
				end if
			end if
			if formFields.ItemByName("PTActionGroup").value = "1" then
				'patikslinti
				PageNum = i
				RowNum = 2
				
				'Uzdedam valiuta
				Call SetCurrency(formFields, RowNum, FieldName, DateType, FormType)
				
				Call ValidateRowSAM3SD(formFields, PageNum, RowNum)
			end if
			if formFields.ItemByName("PTActionGroup").value = "2" then
				'pašalinti
				RowNumDel = 2
				Call formFields.ItemByName("InsIncomeSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("TaxRate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("PaymentSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("Currency_"&RowNumDel).SetCheckValue("")
			end if
			if formFields.ItemByName("PTActionGroup").value = "3" then
				'naujai įrašyti
				RowNumDel = 1
				RowNum = 2
				PageNum = i
				Call formFields.ItemByName("InsIncomeSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("TaxRate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("PaymentSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("Currency_"&RowNumDel).SetCheckValue("")
				
				'Uzdedam valiuta
				Call SetCurrency(formFields, RowNum, FieldName, DateType, FormType)
				Call ValidateRowSAM3SD(formFields, PageNum, RowNum)
			end if
		end if
		Call ValidateEqual(formFields, RowFieldsAllSAM3SD, 1, 2)
		
		if i <> 1 then
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "3" then
				if formFields.ItemByName("Currency_2").value <> "" then
					if formFields.ItemByName("Currency_2").value <> PageCurrency then
						form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_2")), EL_ERROR
					end if
				end if
			elseif formFields.ItemByName("PTActionGroup").value = "2" then
				if formFields.ItemByName("Currency_1").value <> "" then
					if formFields.ItemByName("Currency_1").value <> PageCurrency then
						form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_1")), EL_ERROR
					end if
				end if
			end if
		end if
			
		if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "3" then
			if formFields.ItemByName("Currency_2").value <> "" and PageCurrency = "" then
				PageCurrency = formFields.ItemByName("Currency_2").value
			end if
		elseif formFields.ItemByName("PTActionGroup").value = "2" then
			if formFields.ItemByName("Currency_1").value <> "" and PageCurrency = "" then
				PageCurrency = formFields.ItemByName("Currency_1").value
			end if
		end if
		
	next
End Function

Function RecalcBodySAM3SDP
	dim formFields, FormFields0
	dim i, j, c, before, after, InsIncomeSumDiff, PaymentSumDiff
	dim RowNum, PageNum, rsnCode, pageCount, RowNumDel, FieldName, DateType, FormType
	dim PageCurrency
	
	pageCount = ACount(FormDefs(7))
	set FormFields0 = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	FormFields0.ItemByName("InsIncomeSumDiff").setCheckValue("")
	FormFields0.ItemByName("PaymentSumDiff").setCheckValue("")
	
	PageCurrency = ""
	for i = 1 to pageCount
		set formFields = form.getpagesForTemplate(FormDefs(7)).Item(i).fields
		before = CustCdbl(FormFields.ItemByName("InsIncomeSum_1"))
		after = CustCdbl(FormFields.ItemByName("InsIncomeSum_2"))
		InsIncomeSumDiff = CustCdbl(FormFields0.ItemByName("InsIncomeSumDiff"))
		FormFields0.ItemByName("InsIncomeSumDiff").setCheckValue(Form.FormatDecimal(InsIncomeSumDiff+after-before))
		before = CustCdbl(FormFields.ItemByName("PaymentSum_1"))
		after = CustCdbl(FormFields.ItemByName("PaymentSum_2"))
		PaymentSumDiff = CustCdbl(FormFields0.ItemByName("PaymentSumDiff"))
		FormFields0.ItemByName("PaymentSumDiff").setCheckValue(Form.FormatDecimal(PaymentSumDiff+after-before))
		
		FieldName = "RevisedCycleYear"
		DateType = "Y"
		FormType = "PT-SAM3SDP"
		
		if ValidateRowCommon(formFields, 1) then
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "2" then
				RowNum = 1
				if formFields.ItemByName("PeriodStartDate_"&RowNum).value = "" AND formFields.ItemByName("PeriodEndDate_"&RowNum).value = "" AND formFields.ItemByName("InsIncomeSum_"&RowNum).value = "" AND formFields.ItemByName("TaxRate_"&RowNum).value = "" AND formFields.ItemByName("PaymentSum_"&RowNum).value = "" AND formFields.ItemByName("ReasonCode_"&RowNum).value = "" AND formFields.ItemByName("ReasonText_"&RowNum).value = "" then
					form.setError "Tikslinant arba šalinant duomenis, visi laukai, esantys lentelėje REGISTRO DUOMENYS, negali būti tušti. Laukus galima užpildyti paspaudus mygtuką ""Užpildyti registro duomenis""", GetFieldObjects(formFields, Array("PeriodStartDate_"&RowNum, "PeriodEndDate_"&RowNum, "InsIncomeSum_"&RowNum, "TaxRate_"&RowNum, "PaymentSum_"&RowNum, "ReasonCode_"&RowNum, "ReasonText_"&RowNum, "Currency_"&RowNum), 0), EL_ERROR
				end if
			end if
			if formFields.ItemByName("PTActionGroup").value = "1" then
				'patikslinti
				PageNum = i
				RowNum = 2
				
				'Uzdedam valiuta
				Call SetCurrency(formFields, RowNum, FieldName, DateType, FormType)		
				Call ValidateRowSAM3SDP(formFields, PageNum, RowNum)		
			end if
			if formFields.ItemByName("PTActionGroup").value = "2" then
				'pašalinti
				RowNumDel = 2
				Call formFields.ItemByName("PeriodStartDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("PeriodEndDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("InsIncomeSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("TaxRate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("PaymentSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("Currency_"&RowNumDel).SetCheckValue("")
			end if
			if formFields.ItemByName("PTActionGroup").value = "3" then
				'naujai įrašyti
				RowNumDel = 1
				RowNum = 2
				PageNum = i
				Call formFields.ItemByName("PeriodStartDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("PeriodEndDate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("InsIncomeSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("TaxRate_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("PaymentSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("Currency_"&RowNumDel).SetCheckValue("")
				
				'Uzdedam valiuta
				Call SetCurrency(formFields, RowNum, FieldName, DateType, FormType)
				Call ValidateRowSAM3SDP(formFields, PageNum, RowNum)
			end if
		end if
		Call ValidateEqual(formFields, RowFieldsAllSAM3SDP, 1, 2)
		
		if i <> 1 then
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "3" then
				if formFields.ItemByName("Currency_2").value <> "" then
					if formFields.ItemByName("Currency_2").value <> PageCurrency then
						form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_2")), EL_ERROR
					end if
				end if
			elseif formFields.ItemByName("PTActionGroup").value = "2" then
				if formFields.ItemByName("Currency_1").value <> "" then
					if formFields.ItemByName("Currency_1").value <> PageCurrency then
						form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_1")), EL_ERROR
					end if
				end if
			end if
		end if
			
		if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "3" then
			if formFields.ItemByName("Currency_2").value <> "" and PageCurrency = "" then
				PageCurrency = formFields.ItemByName("Currency_2").value
			end if
		elseif formFields.ItemByName("PTActionGroup").value = "2" then
			if formFields.ItemByName("Currency_1").value <> "" and PageCurrency = "" then
				PageCurrency = formFields.ItemByName("Currency_1").value
			end if
		end if
		
	next
End Function

Sub RecalcBodyNPSD
	dim formFields
	dim i, j, c
	dim RowNum, PageNum, rsnCode, pageCount, RowNumDel, FieldName, DateType, FormType
	dim PageCurrency
	'
	pageCount = ACount(FormDefs(8))
	
	PageCurrency = ""
	for i = 1 to pageCount
	set formFields = form.getpagesForTemplate(FormDefs(8)).Item(i).fields
	FieldName = "B41_Start_"
	DateType = "D"
	FormType = "PT-NP-SD"
	if formFields.ItemByName("PTActionGroup").value = 3 then 
		form.setError "Šiuo atveju pasirinkite lauką 15.1 PATIKSLINTI", GetFieldObjects(FormFields, Array("PTActionGroup"), 0), EL_ERROR
	else
		if ValidateRowCommonNPSD(formFields, 1) then
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "2" then
				RowNum = 1
				if formFields.ItemByName("A5_Series_1").value = "" AND formFields.ItemByName("A8_Series_1").value = "" AND formFields.ItemByName("A6_Start_"&RowNum).value = "" AND formFields.ItemByName("A7_End_"&RowNum).value = "" AND formFields.ItemByName("A9_Start_"&RowNum).value = "" AND formFields.ItemByName("A10_End_"&RowNum).value = "" AND formFields.ItemByName("B11_Start_"&RowNum).value = "" AND formFields.ItemByName("B12_End_"&RowNum).value = "" AND formFields.ItemByName("B21_Start_"&RowNum).value = "" AND formFields.ItemByName("B31_Start_"&RowNum).value = "" AND formFields.ItemByName("B32_End_"&RowNum).value = "" AND formFields.ItemByName("B41_Start_"&RowNum).value = "" AND formFields.ItemByName("B42_End_"&RowNum).value = "" AND formFields.ItemByName("B51_PaymentSum_"&RowNum).value = "" AND formFields.ItemByName("ReasonCode_"&RowNum).value = "" AND formFields.ItemByName("ReasonText_"&RowNum).value = "" then
					form.setError "Tikslinant arba šalinant duomenis, visi laukai, esantys lentelėje REGISTRO DUOMENYS, negali būti tušti. Laukus galima užpildyti paspaudus mygtuką ""Užpildyti registro duomenis""", GetFieldObjects(formFields, Array("A5_Series_1", "A8_Series_1", "A6_Start_"&RowNum, "A7_End_"&RowNum, "A9_Start_"&RowNum, "A10_End_"&RowNum, "B11_Start_"&RowNum, "B12_End_"&RowNum, "B21_Start_"&RowNum, "B31_Start_"&RowNum, "B32_End_"&RowNum, "B41_Start_"&RowNum, "B42_End_"&RowNum, "B51_PaymentSum_"&RowNum, "ReasonCode_"&RowNum, "ReasonText_"&RowNum, "Currency_"&RowNum), 0), EL_ERROR
				end if
			end if
			if formFields.ItemByName("PTActionGroup").value = "1" then
				'patikslinti
				PageNum = i
				RowNum = 2
				Call ValidateRowNPSD(formFields, PageNum, RowNum)
				'Uzdedam valiuta
				Call SetCurrency(formFields, RowNum, FieldName, DateType, FormType)
			end if
			if formFields.ItemByName("PTActionGroup").value = "2" then
				'pašalinti
				RowNumDel = 2
				Call formFields.ItemByName("A5_Series_7").SetCheckValue("")
				Call formFields.ItemByName("A5_Series_8").SetCheckValue("")
				Call formFields.ItemByName("A5_Series_9").SetCheckValue("")
				Call formFields.ItemByName("A5_Series_10").SetCheckValue("")
				Call formFields.ItemByName("A5_Series_11").SetCheckValue("")
				Call formFields.ItemByName("A5_Series_12").SetCheckValue("")
				Call formFields.ItemByName("A8_Series_3").SetCheckValue("")
				Call formFields.ItemByName("A8_Series_4").SetCheckValue("")
				Call formFields.ItemByName("A5_Number_7").SetCheckValue("")
				Call formFields.ItemByName("A5_Number_8").SetCheckValue("")
				Call formFields.ItemByName("A5_Number_9").SetCheckValue("")
				Call formFields.ItemByName("A5_Number_10").SetCheckValue("")
				Call formFields.ItemByName("A5_Number_11").SetCheckValue("")
				Call formFields.ItemByName("A5_Number_12").SetCheckValue("")
				Call formFields.ItemByName("A8_Number_3").SetCheckValue("")
				Call formFields.ItemByName("A8_Number_4").SetCheckValue("")
				Call formFields.ItemByName("A6_Start_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("A7_End_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("A9_Start_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("A10_End_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B11_Start_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B12_End_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B21_Start_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B31_Start_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B32_End_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B41_Start_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B42_End_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B51_PaymentSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("Currency_"&RowNumDel).SetCheckValue("")
			end if
		end if
	end if
	Call ValidateEqual2Lists(formFields, Array("A5_Series_1", "A5_Series_2", "A5_Series_3", "A5_Series_4", "A5_Series_5", "A5_Series_6", "A8_Series_1", "A8_Series_2", "A5_Number_1", "A5_Number_2", "A5_Number_3", "A5_Number_4", "A5_Number_5", "A5_Number_6", "A8_Number_1", "A8_Number_2", "A6_Start_1", "A7_End_1", "A9_Start_1", "A10_End_1", "B11_Start_1", "B12_End_1", "B21_Start_1", "B31_Start_1", "B32_End_1", "B41_Start_1", "B42_End_1", "B51_PaymentSum_1", "ReasonCode_1", "J_group_1"), Array("A5_Series_7", "A5_Series_8", "A5_Series_9", "A5_Series_10", "A5_Series_11", "A5_Series_12", "A8_Series_3", "A8_Series_4", "A5_Number_7", "A5_Number_8", "A5_Number_9", "A5_Number_10", "A5_Number_11", "A5_Number_12", "A8_Number_3", "A8_Number_4", "A6_Start_2", "A7_End_2", "A9_Start_2", "A10_End_2", "B11_Start_2", "B12_End_2", "B21_Start_2", "B31_Start_2", "B32_End_2", "B41_Start_2", "B42_End_2", "B51_PaymentSum_2", "ReasonCode_2", "J_group_2"))
	
	if i <> 1 then
		if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "3" then
			if formFields.ItemByName("Currency_2").value <> "" then
				if formFields.ItemByName("Currency_2").value <> PageCurrency then
					form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_2")), EL_ERROR
				end if
			end if
		elseif formFields.ItemByName("PTActionGroup").value = "2" then
			if formFields.ItemByName("Currency_1").value <> "" then
				if formFields.ItemByName("Currency_1").value <> PageCurrency then
					form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_1")), EL_ERROR
				end if
			end if
		end if
	end if
		
	if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "3" then
		if formFields.ItemByName("Currency_2").value <> "" and PageCurrency = "" then
			PageCurrency = formFields.ItemByName("Currency_2").value
		end if
	elseif formFields.ItemByName("PTActionGroup").value = "2" then
		if formFields.ItemByName("Currency_1").value <> "" and PageCurrency = "" then
			PageCurrency = formFields.ItemByName("Currency_1").value
		end if
	end if
	
	next
End Sub

Sub RecalcBodyNPSD2
	dim formFields
	dim i, j, c
	dim RowNum, PageNum, rsnCode, pageCount, RowNumDel, FieldName, DateType, FormType
	dim PageCurrency
	'
	pageCount = ACount(FormDefs(10))
	
	PageCurrency = ""
	for i = 1 to pageCount
	set formFields = form.getpagesForTemplate(FormDefs(10)).Item(i).fields
	FieldName = "A5_Start_"
	DateType = "D"
	FormType = "PT-NP-SD2"
	if formFields.ItemByName("PTActionGroup").value = 3 then 
		form.setError "Šiuo atveju pasirinkite lauką 15.1 PATIKSLINTI", GetFieldObjects(FormFields, Array("PTActionGroup"), 0), EL_ERROR
	else
		if ValidateRowCommonNPSD(formFields, 1) then
			if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "2" then
				RowNum = 1
if formFields.ItemByName("A5_Start_"&RowNum).value = "" and _
	formFields.ItemByName("A6_End_"&RowNum).value = "" and _
	formFields.ItemByName("A7_"&RowNum).value = "0" and _
	formFields.ItemByName("B1_Start_1_"&RowNum).value = "" and _
	formFields.ItemByName("B1_Start_2_"&RowNum).value = "" and _
	formFields.ItemByName("B1_Start_3_"&RowNum).value = "" and _
	formFields.ItemByName("B3_Start_"&RowNum).value = "" and _
	formFields.ItemByName("B5_Start_"&RowNum).value = "" and _
	formFields.ItemByName("B2_End_1_"&RowNum).value = "" and _
	formFields.ItemByName("B2_End_2_"&RowNum).value = "" and _
	formFields.ItemByName("B2_End_3_"&RowNum).value = "" and _
	formFields.ItemByName("B4_End_"&RowNum).value = "" and _
	formFields.ItemByName("B6_End_"&RowNum).value = "" and _
	formFields.ItemByName("B7_PaymentSum_"&RowNum).value = "" and _
	formFields.ItemByName("Currency_"&RowNum).value = "" and _
	formFields.ItemByName("ReasonCode_"&RowNum).value = "" and _
	formFields.ItemByName("ReasonText_"&RowNum).value = "" then
	form.setError "Tikslinant arba šalinant duomenis, visi laukai, esantys lentelėje REGISTRO DUOMENYS, negali būti tušti. Laukus galima užpildyti paspaudus mygtuką ""Užpildyti registro duomenis""", _
	GetFieldObjects(formFields, Array("A5_Start_"&RowNum, _
																		"A6_End_"&RowNum, _
																		"A7_"&RowNum, _
																		"B1_Start_1_"&RowNum, _
																		"B1_Start_2_"&RowNum, _
																		"B1_Start_3_"&RowNum, _
																		"B3_Start_"&RowNum, _
																		"B5_Start_"&RowNum, _
																		"B2_End_1_"&RowNum, _
																		"B2_End_2_"&RowNum, _
																		"B2_End_3_"&RowNum, _
																		"B4_End_"&RowNum, _
																		"B6_End_"&RowNum, _
																		"B7_PaymentSum_"&RowNum, _
																		"Currency_"&RowNum,	_																					
																		"ReasonCode_"&RowNum, _
																		"ReasonText_"&RowNum), 0), EL_ERROR
end if
			end if
			if formFields.ItemByName("PTActionGroup").value = "1" then
				'patikslinti
				PageNum = i
				RowNum = 2
				Call ValidateRowNPSD2(formFields, PageNum, RowNum)
				'Uzdedam valiuta
				Call SetCurrency(formFields, RowNum, FieldName, DateType, FormType)
			end if
			if formFields.ItemByName("PTActionGroup").value = "2" then
				'pašalinti
				RowNumDel = 2
				Call formFields.ItemByName("A5_Start_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("A6_End_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("A7_"&RowNumDel).SetCheckValue("0")
				Call formFields.ItemByName("B1_Start_1_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B1_Start_2_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B1_Start_3_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B3_Start_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B5_Start_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B2_End_1_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B2_End_2_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B2_End_3_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B4_End_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B6_End_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("B7_PaymentSum_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonCode_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("ReasonText_"&RowNumDel).SetCheckValue("")
				Call formFields.ItemByName("Currency_"&RowNumDel).SetCheckValue("")
			end if
		end if
	end if
	Call ValidateEqual2Lists(formFields, Array("A5_Start_1","A6_End_1","A7_1","B1_Start_1_1","B1_Start_2_1","B1_Start_3_1","B3_Start_1","B5_Start_1","B2_End_1_1","B2_End_2_1","B2_End_3_1","B4_End_1","B6_End_1","B7_PaymentSum_1","ReasonCode_1","ReasonText_1","Currency_1"), Array("A5_Start_2","A6_End_2","A7_2","B1_Start_1_2","B1_Start_2_2","B1_Start_3_2","B3_Start_2","B5_Start_2","B2_End_1_2","B2_End_2_2","B2_End_3_2","B4_End_2","B6_End_2","B7_PaymentSum_2","ReasonCode_2","ReasonText_2","Currency_2"))
	
	if i <> 1 then
		if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "3" then
			if formFields.ItemByName("Currency_2").value <> "" then
				if formFields.ItemByName("Currency_2").value <> PageCurrency then
					form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_2")), EL_ERROR
				end if
			end if
		elseif formFields.ItemByName("PTActionGroup").value = "2" then
			if formFields.ItemByName("Currency_1").value <> "" then
				if formFields.ItemByName("Currency_1").value <> PageCurrency then
					form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_1")), EL_ERROR
				end if
			end if
		end if
	end if
		
	if formFields.ItemByName("PTActionGroup").value = "1" OR formFields.ItemByName("PTActionGroup").value = "3" then
		if formFields.ItemByName("Currency_2").value <> "" and PageCurrency = "" then
			PageCurrency = formFields.ItemByName("Currency_2").value
		end if
	elseif formFields.ItemByName("PTActionGroup").value = "2" then
		if formFields.ItemByName("Currency_1").value <> "" and PageCurrency = "" then
			PageCurrency = formFields.ItemByName("Currency_1").value
		end if
	end if
	
	next
End Sub

Function RecalcBodySAM3SDM
	dim formFields, FormFields0
	dim i, j, c, before, after, InsIncomeSumDiff, PaymentSumDiff
	dim RowNum, PageNum, rsnCode, pageCount, RowNumDel, FieldName, DateType, FormType
	dim PageCurrency
	dim InsIncomePage_1, InsIncomePage_2, PaymentPage_1, PaymentPage_2
	dim TaxRate, PaymentSum
	dim Tapatumas
	
	pageCount = ACount(FormDefs(9))
	set FormFields0 = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	FormFields0.ItemByName("InsIncomeSumDiff").setCheckValue("")
	FormFields0.ItemByName("PaymentSumDiff").setCheckValue("")
	
	PageCurrency = ""
	for i = 1 to pageCount
		set formFields = form.getpagesForTemplate(FormDefs(9)).Item(i).fields
		Call FormFields.ItemByName("PTAction1").SetCheckValue("1")
		
		if FormFields.ItemByName("PTAction1").value <> "1" then
			form.setError "Laukas turi būti užpildytas", Array(formFields.ItemByName("PTAction1")), EL_ERROR
			exit function
		end if
		
		'Is ValidateRowCommon funkcijos patikrinimai (tik tie tikrinimai kuriu reikia)
		if FormFields.ItemByName("PersonFirstName_1").value = "" or FormFields.ItemByName("PersonLastName_1").value = "" then
			form.setError "Neįvesti būtini apdraustojo duomenys", Array(formFields.ItemByName("PersonFirstName_1"),formFields.ItemByName("PersonLastName_1")), EL_ERROR
			exit function
		else 
			if Not (FormFields.ItemByName("PersonCode_1").value = "") then
				If Not validatePersonCode(formFields.ItemByName("PersonCode_1")) then 
					'Tik perspejimas
					exit function
				end if
			end if	
		end if

		if formFields.ItemByName("RevisedCycleYear").value = "" then
			form.setError "Reikia nurodyti tikslinamąjį laikotarpį", Array(formFields.ItemByName("RevisedCycleYear")), EL_ERROR
			exit function
		end if
		
		if formFields.ItemByName("PTAction1").value <> "-1" then
			if formFields.ItemByName("InsIncomeSum_1_1").value = "" AND formFields.ItemByName("TaxRate_1_1").value = "" AND formFields.ItemByName("PaymentSum_1_1").value = "" then
				form.setError "Tikslinant, visi laukai, esantys lentelėje REGISTRO DUOMENYS, negali būti tušti. Laukus galima užpildyti paspaudus mygtuką ""Užpildyti registro duomenis""", GetFieldObjects(formFields, Array("InsIncomeSum_1_1", "TaxRate_1_1", "PaymentSum_1_1"), 0), EL_ERROR
			end if
		end if
		
		FieldName = "RevisedCycleYear"
		DateType = "Y"
		FormType = "PT-SAM3SD-M"
		
		if formFields.ItemByName("PTAction1").value <> "-1" then
			'patikslinti
			PageNum = i
			RowNum = 1
				
			'Uzdedam valiuta
			Call SetCurrency(formFields, RowNum, FieldName, DateType, FormType)	
			
			if not ValidateRowSAM3SDM(formFields, PageNum, RowNum) then
				exit function
			end if
		end if		
		
		for j = 1 to 12
			'Call ValidateTaxes(FormFields, PageNum, RowNum)
			if FormFields.itemByName("InsIncomeSum_"&j&"_2").value <> "" then
				if formFields.itemByName("TaxRate_"&j&"_2").value = "" then
					form.setError "Turi būti nurodytas bendras įmokų tarifas "&PageNum&" lapo "&j&" eilutėje", array(formFields.itemByName("TaxRate_"&j&"_2")), EL_ERROR
					Exit Function
				end if
				
				taxRate = formFields.itemByName("TaxRate_"&j&"_2").toDecimal
				
				if FormFields.ItemByName("RevisedCycleYear").value >= 2019 then
					if (taxRate < 0.00 or taxRate > 99.99) then
						form.setError "Tarifas turi būti skaičius nuo 0,00 iki 99,99 "&PageNum&" lapo "&j&" eilutėje", array(formFields.itemByName("TaxRate_"&j&"_2")), EL_ERROR
						Exit Function
					end if
				else
					if (taxRate < 0.01 or taxRate > 99.99) then
						form.setError "Tarifas turi būti skaičius nuo 0,01 iki 99,99 "&PageNum&" lapo "&j&" eilutėje", array(formFields.itemByName("TaxRate_"&j&"_2")), EL_ERROR
						Exit Function
					end if
				end if
				
				
			end if
		next
		
		for j = 1 to 12
			TaxRate = CustCDbl(formFields.ItemByName("TaxRate_"&j&"_2"))
			if FormFields.itemByName("InsIncomeSum_"&j&"_2").value <> "" and formFields.ItemByName("PaymentSum_"&j&"_2").value = "" then
				PaymentSum = round(FormFields.itemByName("InsIncomeSum_"&j&"_2").toDecimal * TaxRate / 100, 2)
				Call formFields.ItemByName("PaymentSum_"&j&"_2").SetCheckValue(Form.FormatDecimal(PaymentSum))	
			end if
			
			if FormFields.itemByName("InsIncomeSum_"&j&"_2").toDecimal < 0 then form.setError "Lauko reikšmė negali būti neigiama", Array(FormFields.ItemByName("InsIncomeSum_"&j&"_2")), EL_ERROR
			if FormFields.itemByName("PaymentSum_"&j&"_2").toDecimal < 0 then form.setError "Lauko reikšmė negali būti neigiama", Array(FormFields.ItemByName("PaymentSum_"&j&"_2")), EL_ERROR 	
		next

		'Vietoj ValidateEqual ir pridetas tikrinimas, kad butinai nurodytu teisingus duomenis
		
		Tapatumas = true
		for j = 1 to 12
			if FormFields.itemByName("InsIncomeSum_"&j&"_1").value <> "" and _
			  FormFields.itemByName("TaxRate_"&j&"_1").value <> "" and _
				FormFields.itemByName("PaymentSum_"&j&"_1").value <> "" and _
				FormFields.itemByName("InsIncomeSum_"&j&"_2").value <> "" and _
				FormFields.itemByName("TaxRate_"&j&"_2").value <> "" and _
				FormFields.itemByName("PaymentSum_"&j&"_2").value <> "" and _
				Tapatumas = true then
				if FormFields.itemByName("InsIncomeSum_"&j&"_1").toDecimal <> FormFields.itemByName("InsIncomeSum_"&j&"_2").toDecimal or _
				  FormFields.itemByName("TaxRate_"&j&"_1").toDecimal <> FormFields.itemByName("TaxRate_"&j&"_2").toDecimal or _
					FormFields.itemByName("PaymentSum_"&j&"_1").toDecimal <> FormFields.itemByName("PaymentSum_"&j&"_2").toDecimal then
					Tapatumas = false				
				end if
			end if
		next
		
		for j = 1 to 12
			if Tapatumas = true then
				form.setError "Pranešimas neteisingas, skiltyse ""Registro duomenys"" ir ""Nurodomi teisingi duomenys"" nurodyti duomenys yra tapatūs", _
				Array(FormFields.ItemByName("InsIncomeSum_"&j&"_1"),FormFields.ItemByName("TaxRate_"&j&"_1"), FormFields.itemByName("PaymentSum_"&j&"_1"), FormFields.ItemByName("InsIncomeSum_"&j&"_2"), FormFields.ItemByName("TaxRate_"&j&"_2"), FormFields.itemByName("PaymentSum_"&j&"_2")), EL_ERROR
				exit function

			elseif FormFields.itemByName("InsIncomeSum_"&j&"_1").value <> "" and _
			  FormFields.itemByName("TaxRate_"&j&"_1").value <> "" and _
				FormFields.itemByName("PaymentSum_"&j&"_1").value <> "" and _
				(FormFields.itemByName("InsIncomeSum_"&j&"_2").value = "" or FormFields.itemByName("TaxRate_"&j&"_2").value = "" or FormFields.itemByName("PaymentSum_"&j&"_2").value = "") then	
				form.setError "Laukai, esantys skiltyse ""Nurodomi teisingi duomenys"", negali būti tušti.", Array(FormFields.ItemByName("InsIncomeSum_"&j&"_2"), FormFields.ItemByName("TaxRate_"&j&"_2"), FormFields.itemByName("PaymentSum_"&j&"_2")), EL_ERROR
				exit function
			elseif FormFields.itemByName("InsIncomeSum_"&j&"_1").value = "" and _
			  FormFields.itemByName("TaxRate_"&j&"_1").value = "" and _
				FormFields.itemByName("PaymentSum_"&j&"_1").value = "" and _
				(FormFields.itemByName("InsIncomeSum_"&j&"_2").value <> "" or FormFields.itemByName("TaxRate_"&j&"_2").value <> "" or FormFields.itemByName("PaymentSum_"&j&"_2").value <> "") then
				form.setError "Negalima tikslinti eilučių, kurios neužpildytos Registro duomenimis.", Array(FormFields.ItemByName("InsIncomeSum_"&j&"_2"), FormFields.ItemByName("TaxRate_"&j&"_2"), FormFields.itemByName("PaymentSum_"&j&"_2")), EL_ERROR
				exit function
			end if		
		next

		InsIncomePage_1 = 0
		InsIncomePage_2 = 0
		PaymentPage_1 = 0
		PaymentPage_2 = 0
		
		for j = 1 to 12
			InsIncomePage_1 = InsIncomePage_1 + FormFields.ItemByName("InsIncomeSum_"&Cstr(j)&"_1").toDecimal
			InsIncomePage_2 = InsIncomePage_2 + FormFields.ItemByName("InsIncomeSum_"&Cstr(j)&"_2").toDecimal
			PaymentPage_1 = PaymentPage_1 + FormFields.ItemByName("PaymentSum_"&Cstr(j)&"_1").toDecimal
			PaymentPage_2 = PaymentPage_2 + FormFields.ItemByName("PaymentSum_"&Cstr(j)&"_2").toDecimal
		next
		
		Call formFields.ItemByName("InsIncomePage_1").SetCheckValue(Form.FormatDecimal(InsIncomePage_1))
		Call formFields.ItemByName("InsIncomePage_2").SetCheckValue(Form.FormatDecimal(InsIncomePage_2))
		Call formFields.ItemByName("PaymentPage_1").SetCheckValue(Form.FormatDecimal(PaymentPage_1))
		Call formFields.ItemByName("PaymentPage_2").SetCheckValue(Form.FormatDecimal(PaymentPage_2))

		before = CustCdbl(FormFields.ItemByName("InsIncomePage_1"))
		after = CustCdbl(FormFields.ItemByName("InsIncomePage_2"))
		InsIncomeSumDiff = CustCdbl(FormFields0.ItemByName("InsIncomeSumDiff"))
		FormFields0.ItemByName("InsIncomeSumDiff").setCheckValue(Form.FormatDecimal(InsIncomeSumDiff+after-before))
		
		before = CustCdbl(FormFields.ItemByName("PaymentPage_1"))
		after = CustCdbl(FormFields.ItemByName("PaymentPage_2"))
		PaymentSumDiff = CustCdbl(FormFields0.ItemByName("PaymentSumDiff"))
		FormFields0.ItemByName("PaymentSumDiff").setCheckValue(Form.FormatDecimal(PaymentSumDiff+after-before))
		
		if i <> 1 then
				if formFields.ItemByName("Currency_1").value <> "" then
					if formFields.ItemByName("Currency_1").value <> PageCurrency then
						form.setError "Tikslinamas laikotarpis negali apimti skirtingų valiutų laikotarpių", array(formFields.ItemByName("Currency_1")), EL_ERROR
					end if
				end if
		end if
			
		if formFields.ItemByName("Currency_1").value <> "" and PageCurrency = "" then
			PageCurrency = formFields.ItemByName("Currency_1").value
		end if
	next
End Function

Function ValidateRowCommon(FormFields, RowNum)
	dim busena
	
	busena = true
	ValidateRowCommon = false

	if Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReqCommon, RowNum), False) then
		form.setError "Neįvesti būtini apdraustojo duomenys", GetFieldObjects(FormFields, RowFieldsReqCommon, RowNum), EL_ERROR
		busena = false
	else
		if Not (FormFields.ItemByName("PersonCode_"&RowNum).value = "") then
			If Not validatePersonCode(FormFields.ItemByName("PersonCode_"&RowNum)) Then busena = false
		end if
	end if

	if Not FormFields.ItemByName("FormCode").value = "PT-SAM3SD" AND Not FormFields.ItemByName("FormCode").value = "PT-SAM3SDP" and Not FormFields.ItemByName("FormCode").value = "PT-14-SD" then
		if FormFields.ItemByName("RevisedCycleYear").value = "" OR FormFields.ItemByName("RevisedCycleMonth").value = "" then
			form.setError "Reikia nurodyti tikslinamąjį laikotarpį", GetFieldObjects(FormFields, Array("RevisedCycleYear", "RevisedCycleMonth"), 0), EL_ERROR
		end if
	end if
	
	if Not FormFields.ItemByName("RevisedCycleMonth").value = "" then
		if FormFields.ItemByName("RevisedCycleMonth").toDecimal < 1 OR FormFields.ItemByName("RevisedCycleMonth").toDecimal > 12 then
			form.setError "Mėnesio reikšmės galimos nuo 1 iki 12", Array(FormFields.ItemByName("RevisedCycleMonth")), EL_ERROR
			busena = false
		end if
	end if

	if FormFields.ItemByName("FormCode").value = "PT-SAM3SD" OR FormFields.ItemByName("FormCode").value = "PT-SAM3SDP" then
		if FormFields.ItemByName("RevisedCycleYear").value = "" then
			form.setError "Reikia nurodyti tikslinamąjį laikotarpį", GetFieldObjects(FormFields, Array("RevisedCycleYear", "RevisedCycleQuarter", "RevisedCycleMonth"), 0), EL_ERROR
		end if
		if Not FormFields.ItemByName("RevisedCycleQuarter").value = "" then
		if FormFields.ItemByName("RevisedCycleQuarter").toDecimal < 1 OR FormFields.ItemByName("RevisedCycleQuarter").toDecimal > 4 then
			form.setError "Ketvirčio reikšmės galimos nuo 1 iki 4", Array(FormFields.ItemByName("RevisedCycleQuarter")), EL_ERROR
			busena = false
		end if
		end if
		if Not FormFields.ItemByName("RevisedCycleQuarter").value = "" AND Not FormFields.ItemByName("RevisedCycleMonth").value = "" then
			form.setError "Turi būti užpildytas tik vienas iš laukų P15T arba P17T", GetFieldObjects(FormFields, Array("RevisedCycleQuarter", "RevisedCycleMonth"), 0), EL_ERROR
		end if
		if FormFields.ItemByName("RevisedCycleMonth").value = "" AND FormFields.ItemByName("RevisedCycleQuarter").value = "" then
			form.setError "Turi būti užpildytas vienas iš laukų P15T arba P17T", GetFieldObjects(FormFields, Array("RevisedCycleQuarter", "RevisedCycleMonth"), 0), EL_ERROR
		end if
	end if
	
	if Not busena then
		Exit function
	else
		ValidateRowCommon = true
	end if
	
End Function

Function ValidateRowCommonNPSD(FormFields, RowNum)
	dim busena
	
	busena = true
	ValidateRowCommonNPSD = false
	if Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReqCommonNPSD, RowNum), False) then
		form.setError "Neįvesti būtini apdraustojo duomenys", GetFieldObjects(FormFields, RowFieldsReqCommonNPSD, RowNum), EL_ERROR
		busena = false
	else
		if Not (FormFields.ItemByName("PersonCode_"&RowNum).value = "") then
			If Not validatePersonCode(FormFields.ItemByName("PersonCode_"&RowNum)) Then busena = false
		end if
	end if
	if Not FormFields.ItemByName("FormCode").value = "PT-SAM3SD" AND Not FormFields.ItemByName("FormCode").value = "PT-SAM3SDP" then
		if FormFields.ItemByName("RevisedCycleYear").value = "" OR FormFields.ItemByName("RevisedCycleMonth").value = "" then
			form.setError "Reikia nurodyti tikslinamąjį laikotarpį", GetFieldObjects(FormFields, Array("RevisedCycleYear", "RevisedCycleMonth"), 0), EL_ERROR
		end if
	end if

	if Not FormFields.ItemByName("RevisedCycleMonth").value = "" then
	if FormFields.ItemByName("RevisedCycleMonth").toDecimal < 1 OR FormFields.ItemByName("RevisedCycleMonth").toDecimal > 12 then
		form.setError "Mėnesio reikšmės galimos nuo 1 iki 12", Array(FormFields.ItemByName("RevisedCycleMonth")), EL_ERROR
		busena = false
	end if
	end if
	if FormFields.ItemByName("FormCode").value = "PT-SAM3SD" OR FormFields.ItemByName("FormCode").value = "PT-SAM3SDP" then
		if FormFields.ItemByName("RevisedCycleYear").value = "" then
			form.setError "Reikia nurodyti tikslinamąjį laikotarpį", GetFieldObjects(FormFields, Array("RevisedCycleYear", "RevisedCycleQuarter", "RevisedCycleMonth"), 0), EL_ERROR
		end if
		if Not FormFields.ItemByName("RevisedCycleQuarter").value = "" then
		if FormFields.ItemByName("RevisedCycleQuarter").toDecimal < 1 OR FormFields.ItemByName("RevisedCycleQuarter").toDecimal > 4 then
			form.setError "Ketvirčio reikšmės galimos nuo 1 iki 4", Array(FormFields.ItemByName("RevisedCycleQuarter")), EL_ERROR
			busena = false
		end if
		end if
		if Not FormFields.ItemByName("RevisedCycleQuarter").value = "" AND Not FormFields.ItemByName("RevisedCycleMonth").value = "" then
			form.setError "Turi būti užpildytas tik vienas iš laukų P15T arba P17T", GetFieldObjects(FormFields, Array("RevisedCycleQuarter", "RevisedCycleMonth"), 0), EL_ERROR
		end if
		if FormFields.ItemByName("RevisedCycleMonth").value = "" AND FormFields.ItemByName("RevisedCycleQuarter").value = "" then
			form.setError "Turi būti užpildytas vienas iš laukų P15T arba P17T", GetFieldObjects(FormFields, Array("RevisedCycleQuarter", "RevisedCycleMonth"), 0), EL_ERROR
		end if
	end if
	
	if Not busena then
		Exit function
	else
		ValidateRowCommonNPSD = true
	end if
	
End Function

Function ValidateRow1SD(FormFields, PageNum, RowNum)
	dim rsnCode, ProfK, RsnCodeDet
	set ProfK = Prof_kodaiB()
	ValidateRow1SD = false
	If Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReq1SD, RowNum), False) then
		form.setError "Neįvesti būtini nauji apdraustojo duomenys PT-1-SD priede", GetFieldObjects(FormFields, RowFieldsReq1SD, RowNum), EL_ERROR
		Exit Function
	end if
	
	'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "" and FormFields.ItemByName("PersonCode_"&RowNum-1).value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum-1&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq1SD_2, RowNum-1), EL_ERROR
	end if

	rsnCode = FormFields.ItemByName("ReasonCode_"&RowNum).value
	RsnCodeDet = FormFields.ItemByName("ReasonDetCode_"&RowNum).value
	if not ValidateReason1SD(FormFields, PageNum, RowNum, rsnCode, RsnCodeDet) then Exit Function	
	Call check_prf_code(ProfK, FormFields, PageNum, RowNum)
	
	ValidateRow1SD = true
End function

Function ValidateRow2SD(FormFields, PageNum, RowNum)
	dim rsnCode, rsnDetCode
	dim insSum, paySum
	dim CompM, start
	
	start = 0
	
	ValidateRow2SD = false
	if Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReq2SD, RowNum), False) then
		form.setError "Neįvesti būtini nauji apdraustojo duomenys PT-2-SD priede", GetFieldObjects(FormFields, RowFieldsReq2SD, RowNum), EL_ERROR
		Exit Function
	end if
	
	'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "" and FormFields.ItemByName("PersonCode_"&RowNum-1).value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum-1&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq2SD_2, RowNum-1), EL_ERROR
	end if

	rsnCode = FormFields.ItemByName("ReasonCode_"&RowNum).value
	if not ValidateReason2SD(FormFields, PageNum, RowNum, rsnCode) then Exit Function
	
	if not (rsnCode = "10" or rsnCode = "11" or rsnCode = "12" or rsnCode = "13" or rsnCode = "17" or rsnCode = "18" or rsnCode = "20") then
		if FormFields.ItemByName("InsIncomeSum_"&RowNum).value = "" OR FormFields.ItemByName("PaymentSum_"&RowNum).value = "" then
			form.setError "Neįvesti būtini apdraustojo duomenys PT-2-SD priede", Array(FormFields.ItemByName("InsIncomeSum_"&RowNum), FormFields.ItemByName("PaymentSum_"&RowNum)), EL_ERROR
			Exit Function
		end if
		Call ValidateTaxes(FormFields, PageNum, RowNum)
	else
		insSum = FormFields.itemByName("InsIncomeSum_"&RowNum).toDecimal
		paySum = FormFields.itemByName("PaymentSum_"&RowNum).toDecimal
		if insSum = 0 then FormFields.ItemByName("InsIncomeSum_"&RowNum).SetCheckValue("")
		if insSum < 0 then form.setError "Lauko reikšmė negali būti neigiama", Array(FormFields.ItemByName("InsIncomeSum_"&RowNum)), EL_ERROR
		if paySum < 0 then form.setError "Lauko reikšmė negali būti neigiama", Array(FormFields.ItemByName("PaymentSum_"&RowNum)), EL_ERROR
	end if

	if rsnCode = "02" or rsnCode = "16" then
		if Not FormFields.ItemByName("InsuranceEndDate_"&RowNum).value = "" then
			if DateValue(FormFields.ItemByName("InsuranceEndDate_"&RowNum).toDate) >= DateValue("2009-12-01") then
				if FormFields.ItemByName("ReasonDetCode_"&RowNum).value = "" OR FormFields.ItemByName("ReasonDetText_"&RowNum).value = "" OR FormFields.ItemByName("LawActArticle_"&RowNum).value = "" then
					form.setError "Pasirinkus priežastį ATLEIDIMAS laukai A7, A8 ir A30 yra privalomi" , GetFieldObjects(FormFields, Array("ReasonDetCode_", "ReasonDetText_", "LawActArticle_"), RowNum), EL_ERROR
					Exit Function
				end if
				if FormFields.ItemByName("CompensatedMonthsCount_"&RowNum).value = "" then
					form.setError "Laukelis A33 turi būti užpildytas.", GetFieldObjects(FormFields, Array("CompensatedMonthsCount_"), RowNum), EL_ERROR
					Exit Function
				else
					if InStr(1,FormFields.ItemByName("CompensatedMonthsCount_"&RowNum).value,",") > 0 then
						start = InStr(1,FormFields.ItemByName("CompensatedMonthsCount_"&RowNum).value,",")+1
					elseif InStr(1,FormFields.ItemByName("CompensatedMonthsCount_"&RowNum).value,".") > 0 then
						start = InStr(1,FormFields.ItemByName("CompensatedMonthsCount_"&RowNum).value,".")+1
					end if
				
					if start > 0 then
						CompM = Replace(mid(FormFields.ItemByName("CompensatedMonthsCount_"&RowNum).value,start),"0","")
						'panaudota substring, nes mod funkcija apvalina iki 0 
						if FormFields.ItemByName("InsuranceEndDate_"&RowNum).todate < DateValue("2017-07-01") and CompM <> "" then
							form.setError "Kai asmens valstybinio socialinio draudimo pabaiga iki 2017-07-01, išeitinės išmokos/kompensacijos mėnesiai yra sveikasis skaičius "&PageNum&" lapo "&RowNum&" eilutėje", Array(FormFields.ItemByName("InsuranceEndDate_"&RowNum), FormFields.ItemByName("CompensatedMonthsCount_"&RowNum)), EL_ERROR
							Exit Function
						end if
					end if	
				end if
			end if
		end if
	else
		if Not FormFields.ItemByName("LawActArticle_"&RowNum).value = "" OR Not FormFields.ItemByName("LawActPart_"&RowNum).value = "" OR Not FormFields.ItemByName("LawActSubsection_"&RowNum).value = "" then
			form.setError "Šiai priežasčiai laukai A30-A32 nėra pildomi" , GetFieldObjects(FormFields, Array("LawActArticle_", "LawActPart_", "LawActSubsection_"), RowNum), EL_ERROR
			Exit Function
		end if
		
		if rsnCode = "96" then
			FormFields.ItemByName("CompensatedMonthsCount_"&RowNum).SetCheckValue("")
		end if	
	end if
	
	ValidateRow2SD = true
	
	
End function

Function ValidateRow9SD(FormFields, PageNum, RowNum)
	dim rsnCode
	dim men, men_tev
	ValidateRow9SD = false

	'set formFields = form.getpagesForTemplate(FormDefs(3)).Item(1).fields
	If not CompleteFieldSet(formFields, GetFieldNames(RowFieldsReq9SD, RowNum), False) then
		form.setError "Neįvesti būtini nauji apdraustojo duomenys PT-9-SD priede", GetFieldObjects(formFields, RowFieldsReq9SD, RowNum), EL_ERROR
	else
		'Patikrinam del asmens kodo ir SD numerio pildymo
		if ((FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "" and FormFields.ItemByName("PersonCode_"&RowNum-1).value = "") then
			form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum-1&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq9SD_2, RowNum-1), EL_ERROR
		end if
		if DateDiff("d", FormFields.ItemByName("HolidayStartDate_"&RowNum).toDate, FormFields.ItemByName("HolidayEndDate_"&RowNum).toDate) < 0 then
			form.setError "Atostogų pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("HolidayStartDate_"&RowNum,"HolidayEndDate_"&RowNum), 0), EL_ERROR
		end if
		if not FormFields.ItemByName("HolidayCancelDate_"&RowNum).value = "" then
			if (DateDiff("d", FormFields.ItemByName("HolidayStartDate_"&RowNum).toDate, FormFields.ItemByName("HolidayCancelDate_"&RowNum).toDate) < 0) or (DateDiff("d", FormFields.ItemByName("HolidayEndDate_"&RowNum).toDate, FormFields.ItemByName("HolidayCancelDate_"&RowNum).toDate) > 0) then
				form.setError "Atostogų atšaukimo data negali būti ankstesnė už atostogų pradžią ir vėlesnė už atostogų pabaigą", GetFieldObjects(FormFields, Array("HolidayStartDate_"&RowNum,"HolidayEndDate_"&RowNum,"HolidayCancelDate_"&RowNum), 0), EL_ERROR
			end if
			if DateDiff("d", FormFields.ItemByName("HolidayCancelDate_"&RowNum).toDate, FormFields.ItemByName("ChildBirthDate_"&RowNum).toDate) > 0 then
				form.setError "Vaiko gimimo data negali būti vėlesnė už atostogų atšaukimo datą", GetFieldObjects(FormFields, Array("ChildBirthDate_"&RowNum,"HolidayCancelDate_"&RowNum), 0), EL_ERROR
			end if
		end if
		'if DateDiff("d", DateAdd("m", 36, FormFields.ItemByName("ChildBirthDate_"&RowNum).toDate), FormFields.ItemByName("HolidayEndDate_"&RowNum).toDate) > 0 then
		'	form.setError "Atostogos negali būti suteiktos daugiau kaip iki vaikui sukaks 3 metai", GetFieldObjects(FormFields, Array("ChildBirthDate_"&RowNum,"HolidayEndDate_"&RowNum), 0), EL_ERROR
		'end if
		if Not (FormFields.ItemByName("ChildPersonCode_"&RowNum).value = "") then
			Call validatePersonCode(FormFields.ItemByName("ChildPersonCode_"&RowNum))
		end if
		
		if DateDiff("d", FormFields.ItemByName("HolidayStartDate_"&RowNum).toDate, FormFields.ItemByName("ChildBirthDate_"&RowNum).toDate) > 0 then
			form.setError "Laukelyje A15 (atostogos suteiktos nuo) nurodyta data negali būti ankstesnė nei vaiko gimimo data, kuri nurodyta laukelyje A18", GetFieldObjects(FormFields, Array("HolidayStartDate_"&RowNum,"ChildBirthDate_"&RowNum), 0), EL_ERROR
		end if
		
		if not ValidateReason9SD(FormFields, PageNum, RowNum, FormFields.ItemByName("ReasonCode_"&RowNum).value) then 
			Exit Function
		end if
	
		if FormFields.ItemByName("ReasonCode_"&RowNum).value = "01" then
			if FormFields.ItemByName("HolidayStartDate_"&RowNum).toDate >= DateValue("2017-07-01") then
				if FormFields.ItemByName("HolidayEndDate_"&RowNum).value <> "" then
				  if FormFields.ItemByName("HolidayStartDate_"&RowNum).toDate >= DateValue("2020-01-01") then
					  men_tev = 12
					else
            men_tev = 6
					end if
					if DateAdd("m", men_tev, FormFields.ItemByName("ChildBirthDate_"&RowNum).toDate) < FormFields.ItemByName("HolidayEndDate_"&RowNum).toDate then
						form.setError "Nenurodyta arba blogai nurodyta iki kada suteiktos atostogos (laukelis A16)", GetFieldObjects(FormFields, Array("ChildBirthDate_"&RowNum,"HolidayEndDate_"&RowNum), 0), EL_ERROR
					end if
					if FormFields.ItemByName("HolidayEndDate_"&RowNum).toDate - FormFields.ItemByName("HolidayStartDate_"&RowNum).toDate + 1 > 30 then
						form.setError "Darbo kodekso 133 str. 1d. nustatyta 30 kalendorinių dienų tėvystės atostogų trukmė", GetFieldObjects(FormFields, Array("HolidayStartDate_"&RowNum,"HolidayEndDate_"&RowNum), 0), EL_ERROR
					end if
				end if
			else
				if DateAdd("m",1,FormFields.ItemByName("ChildBirthDate_"&RowNum).toDate) < FormFields.ItemByName("HolidayEndDate_"&RowNum).toDate then
					form.setError "Laukelyje A16 (atostogos suteiktos iki) nurodyta data negali būti vėlesnė nei vaikui sukaks vienas mėnuo", GetFieldObjects(FormFields, Array("HolidayEndDate_"&RowNum,"ChildBirthDate_"&RowNum), 0), EL_ERROR
				end if
			end if
		end if
		
		if FormFields.ItemByName("ReasonCode_"&RowNum).value = "02" then
			if DateDiff("d", DateAdd("m", 36, FormFields.ItemByName("ChildBirthDate_"&RowNum).toDate), FormFields.ItemByName("HolidayEndDate_"&RowNum).toDate) > 0 then
				form.setError "Atostogos negali būti suteiktos daugiau kaip iki vaikui sukaks 3 metai", GetFieldObjects(FormFields, Array("ChildBirthDate_"&RowNum,"HolidayEndDate_"&RowNum), 0), EL_ERROR
			end if
		end if
		
		if (FormFields.ItemByName("ReasonCode_"&RowNum).value = "03" and FormFields.ItemByName("HolidayStartDate_"&RowNum).toDate >= DateValue("2017-07-01")) or ((FormFields.ItemByName("ReasonCode_"&RowNum).value = "04" or FormFields.ItemByName("ReasonCode_"&RowNum).value = "05") and FormFields.ItemByName("HolidayStartDate_"&RowNum).toDate < DateValue("2017-07-01")) then	
			form.setError "Neteisingai nurodyta pranešimo pateikimo priežastis arba vaiko priežiūros atostogų suteikimo data", GetFieldObjects(FormFields, Array("ReasonCode_"&RowNum,"HolidayStartDate_"&RowNum), 0), EL_ERROR
		end if
		
		men = 3
		if FormFields.ItemByName("ReasonCode_"&RowNum).value = "03" or FormFields.ItemByName("ReasonCode_"&RowNum).value = "04" then
		  if FormFields.ItemByName("ReasonCode_"&RowNum).value = "04" then
			  if FormFields.ItemByName("HolidayStartDate_"&RowNum).toDate >= DateValue("2018-01-01") then
				  men = 24
				end if
			end if
			if DateAdd("m", men, FormFields.ItemByName("HolidayStartDate_"&RowNum).toDate) < FormFields.ItemByName("HolidayEndDate_"&RowNum).toDate then
				 form.setError "Laukelyje A16 (atostogos suteiktos iki) nurodyta data negali būti vėlesnė negu "&men&" mėnesiai nuo atostogų suteikimo datos, kuri nurodyta laukelyje A15", GetFieldObjects(FormFields, Array("HolidayEndDate_"&RowNum,"HolidayStartDate_"&RowNum), 0), EL_ERROR	
			end if
			if DateDiff("d", DateAdd("m", 12*18, FormFields.ItemByName("ChildBirthDate_"&RowNum).toDate), FormFields.ItemByName("HolidayEndDate_"&RowNum).toDate) > 0 then
				form.setError "Atostogos negali būti suteiktos daugiau kaip iki vaikui sukaks 18 metų", GetFieldObjects(FormFields, Array("ChildBirthDate_"&RowNum,"HolidayEndDate_"&RowNum), 0), EL_ERROR
			end if
		end if
		
		if FormFields.ItemByName("ReasonCode_"&RowNum).value = "06" and FormFields.ItemByName("HolidayStartDate_"&RowNum).toDate < DateValue("2018-01-01") then
			form.setError "Neteisingai nurodyta pranešimo pateikimo priežastis arba tėvystės atostogų suteikimo data", GetFieldObjects(FormFields, Array("ReasonCode_"&RowNum,"HolidayStartDate_"&RowNum), 0), EL_ERROR
		end if
			
		if FormFields.ItemByName("ReasonCode_"&RowNum).value = "07" and FormFields.ItemByName("HolidayStartDate_"&RowNum).toDate < DateValue("2018-04-01") then
			form.setError "Neteisingai nurodyta pranešimo pateikimo priežastis arba atostogų suteikimo data", GetFieldObjects(FormFields, Array("ReasonCode_"&RowNum,"HolidayStartDate_"&RowNum), 0), EL_ERROR
		end if

	end if
					
	ValidateRow9SD = true
End function

Function ValidateRow12SD(FormFields, PageNum, RowNum)
	ValidateRow12SD = false
	dim rsnCode
	If Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReq12SD, RowNum), False) then
		form.setError "Neįvesti būtini nauji apdraustojo duomenys PT-12-SD priede", GetFieldObjects(FormFields, RowFieldsReq12SD, RowNum), EL_ERROR
		Exit Function
	end if
	
	'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "" and FormFields.ItemByName("PersonCode_"&RowNum-1).value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum-1&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq12SD_2, RowNum-1), EL_ERROR
	end if

	rsnCode = FormFields.ItemByName("ReasonCode_"&RowNum).value
	if not ValidateReason12SD(FormFields, PageNum, RowNum, rsnCode) then Exit Function
	
	if DateDiff("d", FormFields.ItemByName("InsuranceSuspendStart_"&RowNum).toDate, FormFields.ItemByName("InsuranceSuspendEnd_"&RowNum).toDate) < 0 then
		form.setError "Nedraudiminio laikotarpio pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("InsuranceSuspendStart_","InsuranceSuspendEnd_"), RowNum), EL_ERROR
	end if
	
	ValidateRow12SD = true
End function

Function ValidateRow13SD(FormFields, PageNum, RowNum)
	dim rsnCode
	dim insSum, paySum
	
	ValidateRow13SD = false
	if Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReq13SD, RowNum), False) then
		form.setError "Neįvesti būtini nauji apdraustojo duomenys PT-13-SD priede", GetFieldObjects(FormFields, RowFieldsReq13SD, RowNum), EL_ERROR
		Exit Function
	end if
	
	'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "" and FormFields.ItemByName("PersonCode_"&RowNum-1).value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum-1&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq13SD_2, RowNum-1), EL_ERROR
	end if

	rsnCode = FormFields.ItemByName("ReasonCode_"&RowNum).value
	if not ValidateReason13SD(FormFields, PageNum, RowNum, rsnCode) then Exit Function
	
	if FormFields.ItemByName("InsIncomeSum_"&RowNum).value = "" then
		form.setError "Neįvesti būtini nauji apdraustojo duomenys PT-13-SD priede", Array(FormFields.ItemByName("InsIncomeSum_"&RowNum)), EL_ERROR
		Exit Function
	end if
	Call ValidateTaxes(FormFields, PageNum, RowNum)
	
	insSum = FormFields.itemByName("InsIncomeSum_"&RowNum).toDecimal
	paySum = FormFields.itemByName("PaymentSum_"&RowNum).toDecimal
	if insSum = 0 then FormFields.ItemByName("InsIncomeSum_"&RowNum).SetCheckValue("")
	if insSum < 0 then form.setError "Lauko reikšmė negali būti neigiama", Array(FormFields.ItemByName("InsIncomeSum_"&RowNum)), EL_ERROR
	if paySum < 0 then form.setError "Lauko reikšmė negali būti neigiama", Array(FormFields.ItemByName("PaymentSum_"&RowNum)), EL_ERROR
	
	if DatePart("yyyy", FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) < 2009 then
		form.setError "Data negali būti ankstesnė už 2009 m. PT-13-SD priede", Array(FormFields.ItemByName("InsuranceStartDate_"&RowNum)), EL_ERROR
		Exit Function
	end if
	
	if DatePart("yyyy", FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) < 2017 and (rsnCode = "08" or rsnCode = "09") then
	  form.setError "08 ar 09 priežasties kodas gali būti pasirenkamas tik kai draudimo pradžia nuo 2017-01-01 "&PageNum&" lapo "&RowNum&" eilutėje", Array(FormFields.ItemByName("InsuranceStartDate_"&RowNum),FormFields.ItemByName("ReasonCode_"&RowNum)), EL_ERROR
	end if
	
	if DatePart("yyyy", FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= 2017 and rsnCode = "07" then
	  form.setError "07 priežasties kodas gali būti pasirenkamas tik kai draudimo pradžia iki 2016-12-31 "&PageNum&" lapo "&RowNum&" eilutėje", Array(FormFields.ItemByName("InsuranceStartDate_"&RowNum),FormFields.ItemByName("ReasonCode_"&RowNum)), EL_ERROR
	end if
	
	if FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate < DateValue("2018-01-01") and rsnCode = "10" then
	  form.setError "10 priežasties kodas gali būti pasirenkamas tik kai draudimo pradžia nuo 2018-01-01 "&PageNum&" lapo "&RowNum&" eilutėje", Array(FormFields.ItemByName("InsuranceStartDate_"&RowNum),FormFields.ItemByName("ReasonCode_"&RowNum)), EL_ERROR
	end if
	
	if FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate < DateValue("2017-07-01") and rsnCode = "11" then
	  form.setError "11 priežasties kodas gali būti pasirenkamas tik kai draudimo pradžia nuo 2017-07-01 "&PageNum&" lapo "&RowNum&" eilutėje", Array(FormFields.ItemByName("InsuranceStartDate_"&RowNum),FormFields.ItemByName("ReasonCode_"&RowNum)), EL_ERROR
	end if
	
	if FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate < DateValue("2017-07-01") and rsnCode = "12" then
	  form.setError "12 priežasties kodas gali būti pasirenkamas tik kai draudimo pradžia nuo 2017-07-01 "&PageNum&" lapo "&RowNum&" eilutėje", Array(FormFields.ItemByName("InsuranceStartDate_"&RowNum),FormFields.ItemByName("ReasonCode_"&RowNum)), EL_ERROR
	end if
		
	ValidateRow13SD = true
End function

Function ValidateRowSAM3SD(FormFields, PageNum, RowNum)
	dim insSum, paySum
	ValidateRowSAM3SD = false
	
	If Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReqSAM3SD, RowNum), False) then
		form.setError "Neįvesti būtini nauji apdraustojo duomenys PT-SAM3SD priede", GetFieldObjects(FormFields, RowFieldsReqSAM3SD, RowNum), EL_ERROR
		Exit Function
	end if
	
	'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "" and FormFields.ItemByName("PersonCode_"&RowNum-1).value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum-1&" eilutėje", GetFieldObjects(FormFields, RowFieldsReqSAM3SD_2, RowNum-1), EL_ERROR
	end if
	
	Call ValidateTaxes(FormFields, PageNum, RowNum)
	insSum = FormFields.itemByName("InsIncomeSum_"&RowNum).toDecimal
	paySum = FormFields.itemByName("PaymentSum_"&RowNum).toDecimal
	'if insSum = 0 then FormFields.ItemByName("InsIncomeSum_"&RowNum).SetCheckValue("")
	if insSum < 0 then form.setError "Lauko reikšmė negali būti neigiama", Array(FormFields.ItemByName("InsIncomeSum_"&RowNum)), EL_ERROR
	if paySum < 0 then form.setError "Lauko reikšmė negali būti neigiama", Array(FormFields.ItemByName("PaymentSum_"&RowNum)), EL_ERROR
	
	ValidateRowSAM3SD = true
End function

Function ValidateRowSAM3SDP(FormFields, PageNum, RowNum)
	ValidateRowSAM3SDP = false
	dim rsnCode, qY, qM, pStartY, pStartM, pEndY, pEndM, insSum, paySum
	dim FormFields0
	
	set FormFields0 = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	
	if not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReqSAM3SDP, RowNum), False) then
		form.setError "Neįvesti būtini nauji apdraustojo duomenys PT-SAM3SDP priede", GetFieldObjects(FormFields, RowFieldsReqSAM3SDP, RowNum), EL_ERROR
		Exit function
	end if
	
	'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "" and FormFields.ItemByName("PersonCode_"&RowNum-1).value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum-1&" eilutėje", GetFieldObjects(FormFields, RowFieldsReqSAM3SDP_2, RowNum-1), EL_ERROR
	end if
	
	rsnCode = FormFields.ItemByName("ReasonCode_"&RowNum).value
	if not ValidateReasonSAM3SDP(FormFields, PageNum, RowNum, rsnCode) then Exit Function
	
	if DateDiff("d", FormFields.ItemByName("PeriodStartDate_"&RowNum).toDate, FormFields.ItemByName("PeriodEndDate_"&RowNum).toDate) < 0 then
		form.setError "Valstybinio socialinio draudimo pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("PeriodStartDate_","PeriodEndDate_"), RowNum), EL_ERROR
		Exit function
	end if
	
	Call ValidateTaxes(FormFields, PageNum, RowNum)
	insSum = FormFields.itemByName("InsIncomeSum_"&RowNum).toDecimal
	paySum = FormFields.itemByName("PaymentSum_"&RowNum).toDecimal
	'if insSum = 0 then FormFields.ItemByName("InsIncomeSum_"&RowNum).SetCheckValue("")
	if insSum < 0 then form.setError "Lauko reikšmė negali būti neigiama", Array(FormFields.ItemByName("InsIncomeSum_"&RowNum)), EL_ERROR
	if paySum < 0 then form.setError "Lauko reikšmė negali būti neigiama", Array(FormFields.ItemByName("PaymentSum_"&RowNum)), EL_ERROR
	
	ValidateRowSAM3SDP = true
End function

Function ValidateRowNPSD(FormFields, PageNum, RowNum)
	dim rsnCode, A8RowNum, A5RowNum
	ValidateRowNPSD = false

	A5RowNum = 7
	A8RowNum = 3
	If Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReqNPSD, 1), False) then
		form.setError "Neįvesti būtini apdraustojo duomenys NP-SD priede", GetFieldObjects(FormFields, RowFieldsReqNPSD, 1), EL_ERROR
		Exit Function
	end if
	If Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReqPeriod, 0), False) then
		form.setError "Nurodykite laikotarpį", GetFieldObjects(FormFields, RowFieldsReqPeriod, 0), EL_ERROR
		Exit Function
	end if
	'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "" and FormFields.ItemByName("PersonCode_"&RowNum-1).value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum-1&" eilutėje", GetFieldObjects(FormFields, RowFieldsReqNPSD_2, RowNum-1), EL_ERROR
	end if
	
	rsnCode = FormFields.ItemByName("ReasonCode_"&RowNum).value
'---------------------
	if ValidateA5(FormFields) then
	if ValidateA8(FormFields) then
		if (FormFields.ItemByName("A5_Series_"&A5RowNum).value = "" AND FormFields.ItemByName("A8_Series_"&A8RowNum).value = "") then
			form.setError "Turi būti užpildytas A5, arba(ir) A8", GetFieldObjects(FormFields, Array("A5_Series_"&A5RowNum, "A8_Series_"&A8RowNum, "A5_Number_"&A5RowNum, "A8_Number_"&A8RowNum), 0), EL_ERROR
			Exit Function
		end if
		if (FormFields.ItemByName("A5_Series_"&A5RowNum).value = "" AND not FormFields.ItemByName("A8_Series_"&A8RowNum).value = "") AND not FormFields.ItemByName("B11_Start_"&RowNum).value = "" then
			form.setError "Kai A8 užpildytas, o A5 neužpildytas, tai ir B11 turi būti neužpildytas", GetFieldObjects(FormFields, Array("B11_Start_"&RowNum, "B12_End_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
	end if
	end if
'--------------------		
	if ValidateA5(FormFields) then
		if Not FormFields.ItemByName("A5_Series_"&A5RowNum).value = "" AND FormFields.ItemByName("B11_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("ReasonCode_"&RowNum).value = "05" then
			form.setError "Nenurodytas laikotarpis B11-B12", GetFieldObjects(FormFields, Array("B11_Start_"&RowNum, "A5_Series_"&A5RowNum, "A5_Number_"&A5RowNum), 0), EL_ERROR
			Exit Function
		end if
		if Not FormFields.ItemByName("A5_Series_"&A5RowNum).value = "" AND Not FormFields.ItemByName("A6_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("A7_End_"&RowNum).value = "" then
			if DateDiff("d", FormFields.ItemByName("A6_Start_"&RowNum).toDate, FormFields.ItemByName("A7_End_"&RowNum).toDate) < 0 then
				form.setError "Pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("A6_Start_"&RowNum, "A7_End_"&RowNum), 0), EL_ERROR
				Exit Function
			end if
			if DateDiff("d", FormFields.ItemByName("DocDate").toDate, FormFields.ItemByName("A7_End_"&RowNum).toDate) > 0 then
				form.setError "Pabaigos data negali būti vėlesnė už dokumento pateikimo datą", GetFieldObjects(FormFields, Array("DocDate", "A7_End_"&RowNum), 0), EL_ERROR
				Exit Function
			end if		
		
		else
			if Not (FormFields.ItemByName("A5_Series_"&A5RowNum).value = "" AND FormFields.ItemByName("A6_Start_"&RowNum).value = "" AND FormFields.ItemByName("A7_End_"&RowNum).value = "") then
				form.setError "Laukai A5, A6 ir A7 turi būti užpildyti kartu, arba visiškai nepildomi", GetFieldObjects(FormFields, Array("A5_Series_"&A5RowNum, "A5_Number_"&A5RowNum, "A6_Start_"&RowNum, "A7_End_"&RowNum), 0), EL_ERROR
				Exit Function
			else
				if DateDiff("d", FormFields.ItemByName("A6_Start_"&RowNum).toDate, FormFields.ItemByName("A7_End_"&RowNum).toDate) < 0 then
					form.setError "Pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("A6_Start_"&RowNum, "A7_End_"&RowNum), 0), EL_ERROR
					Exit Function
				end if
			end if
		end if
	end if
'-----------------
	if ValidateA8(FormFields) then
		if Not FormFields.ItemByName("A8_Series_"&A8RowNum).value = "" AND Not FormFields.ItemByName("A9_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("A10_End_"&RowNum).value = "" AND Not FormFields.ItemByName("B21_Start_"&RowNum).value = "" then
			if DateDiff("d", FormFields.ItemByName("A9_Start_"&RowNum).toDate, FormFields.ItemByName("A10_End_"&RowNum).toDate) < 0 then
				form.setError "Pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("A9_Start_"&RowNum, "A10_End_"&RowNum), 0), EL_ERROR
				Exit Function
			end if		
		else
			if Not FormFields.ItemByName("A8_Series_"&A8RowNum).value = "" AND Not FormFields.ItemByName("A9_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("A10_End_"&RowNum).value = "" AND FormFields.ItemByName("B21_Start_"&RowNum).value = "" then
				form.setError "Laukai A8, A9, A10 ir B21 turi būti užpildyti kartu, arba visiškai nepildomi (neužpildyta B21)", GetFieldObjects(FormFields, Array("B21_Start_"&RowNum, "A8_Series_"&A8RowNum, "A8_Number_"&A8RowNum, "A9_Start_"&RowNum, "A10_End_"&RowNum), 0), EL_ERROR
				Exit Function
			end if
			if Not (FormFields.ItemByName("A8_Series_"&A8RowNum).value = "" AND FormFields.ItemByName("A9_Start_"&RowNum).value = "" AND FormFields.ItemByName("A10_End_"&RowNum).value = "" AND FormFields.ItemByName("B21_Start_"&RowNum).value = "") then
				form.setError "Laukai A8, A9, A10 ir B21 turi būti užpildyti kartu, arba visiškai nepildomi", GetFieldObjects(FormFields, Array("B21_Start_"&RowNum, "A8_Series_"&A8RowNum, "A8_Number_"&A8RowNum, "A9_Start_"&RowNum, "A10_End_"&RowNum), 0), EL_ERROR
				Exit Function
			else
				if DateDiff("d", FormFields.ItemByName("A9_Start_"&RowNum).toDate, FormFields.ItemByName("A10_End_"&RowNum).toDate) < 0 then
					form.setError "Pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("A9_Start_"&RowNum, "A10_End_"&RowNum), 0), EL_ERROR
					Exit Function
				end if		
			end if
		end if
	end if
'------------------
	TikrintiUnikalius(FormFields)
	if (FormFields.ItemByName("B11_Start_"&RowNum).value = "" and FormFields.ItemByName("B12_End_"&RowNum).value <> "") or (FormFields.ItemByName("B11_Start_"&RowNum).value <> "" and FormFields.ItemByName("B12_End_"&RowNum).value = "") then
		form.setError "Nenurodytas laikotarpis B11-B12", GetFieldObjects(FormFields, Array("B11_Start_"&RowNum, "B12_End_"&RowNum), 0), EL_ERROR
		Exit Function
	end if
	if DateDiff("d", FormFields.ItemByName("B11_Start_"&RowNum).toDate, FormFields.ItemByName("B12_End_"&RowNum).toDate) < 0 then
		form.setError "Pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("B11_Start_"&RowNum, "B12_End_"&RowNum), 0), EL_ERROR
		Exit Function
	end if
	if Not FormFields.ItemByName("B11_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("A6_Start_"&RowNum).value = "" then
		if DateDiff("d", FormFields.ItemByName("B11_Start_"&RowNum).toDate, FormFields.ItemByName("A6_Start_"&RowNum).toDate) > 0 then
			form.setError "Data B11 negali būti ankstesnė už A6", GetFieldObjects(FormFields, Array("B11_Start_"&RowNum, "A6_Start_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
	end if
	if Not FormFields.ItemByName("B12_End_"&RowNum).value = "" AND Not FormFields.ItemByName("A9_Start_"&RowNum).value = "" then
		if DateDiff("d", FormFields.ItemByName("B12_End_"&RowNum).toDate, FormFields.ItemByName("A9_Start_"&RowNum).toDate) < 0 then
			form.setError "Data B12 negali būti vėlesnė už A9", GetFieldObjects(FormFields, Array("B12_End_"&RowNum, "A9_Start_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
	end if
	if DateDiff("d", FormFields.ItemByName("B21_Start_"&RowNum).toDate, FormFields.ItemByName("A9_Start_"&RowNum).toDate) > 0 then
		form.setError "Data B21 negali būti ankstesnė už A9", GetFieldObjects(FormFields, Array("B21_Start_"&RowNum, "A9_Start_"&RowNum), 0), EL_ERROR
		Exit Function
	end if
'-----------------
	if Not FormFields.ItemByName("B31_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("B32_End_"&RowNum).value = "" then
		if DateDiff("d", FormFields.ItemByName("B31_Start_"&RowNum).toDate, FormFields.ItemByName("B32_End_"&RowNum).toDate) < 0 then
			form.setError "Pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("B31_Start_"&RowNum, "B32_End_"&RowNum), 0), EL_ERROR
			Exit Function
		end if		
	else
		if Not (FormFields.ItemByName("B31_Start_"&RowNum).value = "" AND FormFields.ItemByName("B32_End_"&RowNum).value = "") then
			form.setError "Laukai B31 ir B32 turi būti užpildyti kartu, arba visiškai nepildomi", GetFieldObjects(FormFields, Array("B31_Start_"&RowNum, "B32_End_"&RowNum), 0), EL_ERROR
			Exit Function
		else
			if DateDiff("d", FormFields.ItemByName("B31_Start_"&RowNum).toDate, FormFields.ItemByName("B32_End_"&RowNum).toDate) < 0 then
				form.setError "Pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("B31_Start_"&RowNum, "B32_End_"&RowNum), 0), EL_ERROR
				Exit Function
			end if		
		end if
	end if
'----------------
	if FormFields.ItemByName("B41_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("B42_End_"&RowNum).value = "" then
		form.setError "Jei B42 užpildytas, privalo būti užpildytas ir B41", GetFieldObjects(FormFields, Array("B41_Start_"&RowNum, "B42_End_"&RowNum), 0), EL_ERROR
		Exit Function
	end if
	if Not FormFields.ItemByName("B41_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("B42_End_"&RowNum).value = "" then
		if DateDiff("d", FormFields.ItemByName("B41_Start_"&RowNum).toDate, FormFields.ItemByName("B42_End_"&RowNum).toDate) < 0 then
			form.setError "B42 negali būti ankstesnė už B41", GetFieldObjects(FormFields, Array("B41_Start_"&RowNum, "B42_End_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
		if DateDiff("d", FormFields.ItemByName("B41_Start_"&RowNum).toDate, FormFields.ItemByName("B42_End_"&RowNum).toDate) = 0 or DateDiff("d", FormFields.ItemByName("B41_Start_"&RowNum).toDate, FormFields.ItemByName("B42_End_"&RowNum).toDate) > 1 then
			form.setError "Jei pašalpą už darbdavio lėšų skiriate už abi pirmąsias kalendorines dienas, data B42 turi būti vėlesnė už B41. Jei už vieną dieną - šis laukas turi būti tuščias", GetFieldObjects(FormFields, Array("B41_Start_"&RowNum, "B42_End_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
	end if

	if Not FormFields.ItemByName("B41_Start_"&RowNum).value = "" AND Not (FormFields.ItemByName("B51_PaymentSum_"&RowNum).value = "" OR FormFields.ItemByName("B51_PaymentSum_"&RowNum).ToDecimal <= 0) then
		if DateDiff("d", FormFields.ItemByName("B41_Start_"&RowNum).toDate, FormFields.ItemByName("A6_Start_"&RowNum).toDate) > 0 then
			form.setError "Data B41 negali būti ankstesnė už A6", GetFieldObjects(FormFields, Array("B41_Start_"&RowNum, "A6_Start_"&RowNum), 0), EL_ERROR
			Exit Function
		end if		
	'else
	'	if Not (FormFields.ItemByName("B41_Start_"&RowNum).value = "" AND FormFields.ItemByName("B51_PaymentSum_"&RowNum).value = "") then
	'		form.setError "Laukai B41, B51 turi būti užpildyti visi kartu, arba visiškai nepildomi", GetFieldObjects(FormFields, Array("B51_PaymentSum_"&RowNum, "B41_Start_"&RowNum), 0), EL_ERROR
		'Exit Function
	'	end if
	end if
	
	if Not FormFields.ItemByName("A6_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("A7_End_"&RowNum).value = "" AND Not FormFields.ItemByName("B11_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("B12_End_"&RowNum).value = "" then
	if DateValue(FormFields.ItemByName("A6_Start_"&RowNum).value) = DateValue(FormFields.ItemByName("A7_End_"&RowNum).value) AND DateValue(FormFields.ItemByName("A6_Start_"&RowNum).value) = DateValue(FormFields.ItemByName("B11_Start_"&RowNum).value) AND DateValue(FormFields.ItemByName("A6_Start_"&RowNum).value) = DateValue(FormFields.ItemByName("B12_End_"&RowNum).value) then
		'do nothing
	else
		if FormFields.ItemByName("A8_Series_"&A8RowNum).value = "" AND (FormFields.ItemByName("B51_PaymentSum_"&RowNum).value = "" OR FormFields.ItemByName("B51_PaymentSum_"&RowNum).ToDecimal <= 0) AND FormFields.ItemByName("ReasonCode_"&RowNum).Value = "" then
			form.setError "Nenurodyti duomenys apie pašalpą iš darbdavio lėšų", GetFieldObjects(formFields, Array("ReasonCode_"&RowNum, "ReasonText_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
	end if
	end if
				
	if FormFields.ItemByName("InsuranceSeries_1").value = "" OR FormFields.ItemByName("InsuranceNumber_1").value = "" then
		form.setError "Turi būti įvestas asmens socialinio draudimo numeris", GetFieldObjects(formFields, Array("InsuranceSeries_1", "InsuranceNumber_1"), 0), EL_ERROR
		Exit Function
	end if
	
	if FormFields.ItemByName("A5_Series_"&A5RowNum).value = "" AND Not FormFields.ItemByName("A8_Series_"&A8RowNum).value = "" then
		if not FormFields.ItemByName("ReasonCode_"&RowNum).value = "" OR not FormFields.ItemByName("B51_PaymentSum_"&RowNum).value = "" then
			form.setError "Kai užpildomas tik A8, tai pildyti B51 ir B6 nereikia", GetFieldObjects(formFields, Array("B51_PaymentSum_"&RowNum, "ReasonCode_"&RowNum, "ReasonText_"&RowNum), 0), EL_ERROR
		end if
	else
		if Not FormFields.ItemByName("A6_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("A7_End_"&RowNum).value = "" AND Not FormFields.ItemByName("B11_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("B12_End_"&RowNum).value = "" then
		if DateValue(FormFields.ItemByName("A6_Start_"&RowNum).value) = DateValue(FormFields.ItemByName("A7_End_"&RowNum).value) AND DateValue(FormFields.ItemByName("A6_Start_"&RowNum).value) = DateValue(FormFields.ItemByName("B11_Start_"&RowNum).value) AND DateValue(FormFields.ItemByName("A6_Start_"&RowNum).value) = DateValue(FormFields.ItemByName("B12_End_"&RowNum).value) then
			'do nothing
		else
			if FormFields.ItemByName("B42_End_"&RowNum).value = "" OR FormFields.ItemByName("B51_PaymentSum_"&RowNum).value = "" OR FormFields.ItemByName("B51_PaymentSum_"&RowNum).ToDecimal <= 0 then
				if FormFields.ItemByName("ReasonCode_"&RowNum).value = "" then
					form.setError "Kai nenurodyta suma B51 ir datos B41, B42 reikia nurodyti neskyrimo priežastį B6 "&PageNum&" lape", GetFieldObjects(formFields, Array("ReasonCode_"&RowNum, "ReasonText_"&RowNum), 0), EL_ERROR
				end if
			end if
		end if
		end if
	'do  nothing
	end if
	
	if FormFields.ItemByName("ReasonCode_"&RowNum).value <> "" and FormFields.ItemByName("B11_Start_"&RowNum).value <> "" and FormFields.ItemByName("B12_End_"&RowNum).value <> "" then	
		if FormFields.ItemByName("B41_Start_"&RowNum).value <> "" and FormFields.ItemByName("B42_End_"&RowNum).value <> "" then
			
			if FormFields.ItemByName("B51_PaymentSum_"&RowNum).value <> "" and FormFields.ItemByName("ReasonCode_"&RowNum).value <> "05" then
				form.setError "Jeigu ligos pašalpa priskaičiuota už abi pirmąsias laikinojo nedarbingumo dienas, laukelis B6 nepildomas "&PageNum&" lape", GetFieldObjects(formFields, Array("ReasonCode_"&RowNum, "ReasonText_"&RowNum), 0), EL_ERROR
			end if
			
			if FormFields.ItemByName("B51_PaymentSum_"&RowNum).value = "" then
				form.setError "Įrašykite priskaičiuotą ligos pašalpos sumą iš darbdavio lėšų "&PageNum&" lape", GetFieldObjects(formFields, Array("B51_PaymentSum_"&RowNum), 0), EL_ERROR
			end if
			
		end if	

		if FormFields.ItemByName("B42_End_"&RowNum).value <> "" and FormFields.ItemByName("B51_PaymentSum_"&RowNum).value <> "" and FormFields.ItemByName("B41_Start_"&RowNum).value = "" then
			form.setError "Įrašykite dienos, už kurią apskaičiavote ligos pašalpos sumą iš darbdavio lėšų, datą į laukelį B41 "&PageNum&" lape", GetFieldObjects(formFields, Array("B41_Start_"&RowNum), 0), EL_ERROR
		end if
		
		if FormFields.ItemByName("B51_PaymentSum_"&RowNum).value <> "" and FormFields.ItemByName("B41_Start_"&RowNum).value = "" and FormFields.ItemByName("B42_End_"&RowNum).value = "" then				
			form.setError "Įrašykite dienų, už kurias apskaičiavote ligos pašalpos sumą iš darbdavio lėšų, datas laukeliuose B41 ir B42 dienas arba nepildykite laukelio B51 "&PageNum&" lape", GetFieldObjects(formFields, Array("B41_Start_"&RowNum,"B42_End_"&RowNum,"B51_PaymentSum_"&RowNum), 0), EL_ERROR
		end if
		
		if FormFields.ItemByName("B41_Start_"&RowNum).value <> "" and FormFields.ItemByName("B51_PaymentSum_"&RowNum).value = "" and FormFields.ItemByName("B42_End_"&RowNum).value = "" then
			form.setError "Įrašykite priskaičiuotą ligos pašalpos sumą iš darbdavio lėšų į laukelį B51 arba nepildykite laukelio B41 "&PageNum&" lape", GetFieldObjects(formFields, Array("B51_PaymentSum_"&RowNum,"B41_Start_"&RowNum), 0), EL_ERROR
		end if
		
		if FormFields.ItemByName("B42_End_"&RowNum).value <> "" and FormFields.ItemByName("B51_PaymentSum_"&RowNum).value = "" and FormFields.ItemByName("B41_Start_"&RowNum).value = "" then
			form.setError "Įrašykite dienos, už kurią apskaičiavote ligos pašalpos sumą iš darbdavio lėšų, datą į laukelį B41 ir užpildykite laukelį B51 arba nepildykite laukelio B42 "&PageNum&" lape", GetFieldObjects(formFields, Array("B41_Start_"&RowNum,"B42_End_"&RowNum,"B51_PaymentSum_"&RowNum), 0), EL_ERROR
		end if
		
	end if
	
	if FormFields.ItemByName("ReasonCode_"&RowNum).value = "05" and FormFields.ItemByName("ReasonText_"&RowNum).value = "" then
		form.setError "Būtina įrašyti priežastis", GetFieldObjects(formFields, Array("ReasonCode_"&RowNum, "ReasonText_"&RowNum), 0), EL_ERROR
	end if
	
	ValidateRowNPSD = true
End function

Function ValidateRowNPSD2(FormFields, PageNum, RowNum)
	dim rsnCode
	dim i
	ValidateRowNPSD2 = false

	if FormFields.ItemByName("DocDate").value <> "" then
		if FormFields.ItemByName("DocDate").toDate < DateValue("2018-10-01") then
		  form.setError "NP-SD2 gali būti teikiamas tik nuo 2018-10-01", Array(FormFields.ItemByName("DocDate")), EL_ERROR
		end if
	end if
	
	If Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReqNPSD, 1), False) then
		form.setError "Neįvesti būtini apdraustojo duomenys NP-SD priede", GetFieldObjects(FormFields, RowFieldsReqNPSD, 1), EL_ERROR
		Exit Function
	end if
	If Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReqPeriod, 0), False) then
		form.setError "Nurodykite laikotarpį", GetFieldObjects(FormFields, RowFieldsReqPeriod, 0), EL_ERROR
		Exit Function
	end if
	'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum-1).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum-1).value = "" and FormFields.ItemByName("PersonCode_"&RowNum-1).value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum-1&" eilutėje", GetFieldObjects(FormFields, RowFieldsReqNPSD_2, RowNum-1), EL_ERROR
	end if
	
	rsnCode = FormFields.ItemByName("ReasonCode_"&RowNum).value

	if FormFields.ItemByName("A5_Start_"&RowNum).value = "" or FormFields.ItemByName("A6_End_"&RowNum).value = "" then
		form.setError "Nenurodytas laikotarpis A5-A6 "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("A5_Start_"&RowNum, "A6_End_"&RowNum), 0), EL_ERROR
		Exit Function
	else	
		if DateDiff("d", FormFields.ItemByName("A5_Start_"&RowNum).toDate, FormFields.ItemByName("A6_End_"&RowNum).toDate) < 0 then
			form.setError "Pradžios data negali būti vėlesnė, negu pabaigos "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("A5_Start_"&RowNum, "A6_End_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
		
		for i = 1 to 3
			if (FormFields.ItemByName("B1_Start_"&i&"_"&RowNum).value <> "" and FormFields.ItemByName("B2_End_"&i&"_"&RowNum).value = "") or (FormFields.ItemByName("B1_Start_"&i&"_"&RowNum).value = "" and FormFields.ItemByName("B2_End_"&i&"_"&RowNum).value <> "") then
				form.setError "Nenurodytas laikotarpis B1-B2 "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B1_Start_"&i&"_"&RowNum, "B2_End_"&i&"_"&RowNum), 0), EL_ERROR
				Exit Function
			end if
		next
	end if
	
	if (FormFields.ItemByName("B3_Start_"&RowNum).value <> "" and FormFields.ItemByName("B4_End_"&RowNum).value = "") or (FormFields.ItemByName("B3_Start_"&RowNum).value = "" and FormFields.ItemByName("B4_End_"&RowNum).value <> "") then
		form.setError "Nenurodytas laikotarpis B3-B4 "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B3_Start_"&RowNum, "B4_End_"&RowNum), 0), EL_ERROR
		Exit Function
	end if
	
	if FormFields.ItemByName("A7_"&RowNum).value = "1" then
	  FormFields.ItemByName("B5_Start_"&RowNum).SetCheckValue("")
		FormFields.ItemByName("B6_End_"&RowNum).SetCheckValue("")
		FormFields.ItemByName("B7_PaymentSum_"&RowNum).SetCheckValue("")
		FormFields.ItemByName("ReasonCode_"&RowNum).SetCheckValue("")
		FormFields.ItemByName("ReasonText_"&RowNum).SetCheckValue("")
	end if
	
	'--
	if FormFields.ItemByName("A7_"&RowNum).value <> "1" then
		if (FormFields.ItemByName("B5_Start_"&RowNum).value <> "" and FormFields.ItemByName("B6_End_"&RowNum).value = "" and FormFields.ItemByName("ReasonCode_"&RowNum).value = "") or (FormFields.ItemByName("B5_Start_"&RowNum).value = "" and FormFields.ItemByName("B6_End_"&RowNum).value <> "") then
			form.setError "Nenurodytas laikotarpis B5-B6 arba B5, B8, jeigu B5 tik viena nedarbingumo diena "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B5_Start_"&RowNum, "B6_End_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
	end if
	
	for i = 1 to 3
		if FormFields.ItemByName("A5_Start_"&RowNum).value <> "" and FormFields.ItemByName("B1_Start_"&i&"_"&RowNum).value <> "" then
			if FormFields.ItemByName("B1_Start_"&i&"_"&RowNum).toDate < FormFields.ItemByName("A5_Start_"&RowNum).toDate then
				form.setError "Data B1 negali būti ankstesnė už A5 "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B1_Start_"&i&"_"&RowNum, "A5_Start_"&RowNum), 0), EL_ERROR
				Exit Function
			end if
		end if

		if FormFields.ItemByName("A6_End_"&RowNum).value <> "" and FormFields.ItemByName("B2_End_"&i&"_"&RowNum).value <> "" then
			if FormFields.ItemByName("B2_End_"&i&"_"&RowNum).toDate > FormFields.ItemByName("A6_End_"&RowNum).toDate then
				form.setError "Data B2 negali būti vėlesnė už A6 "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B2_End_"&i&"_"&RowNum, "A6_End_"&RowNum), 0), EL_ERROR
				Exit Function
			end if
		end if		
	next
	
	if FormFields.ItemByName("A5_Start_"&RowNum).value <> "" and FormFields.ItemByName("B3_Start_"&RowNum).value <> "" then
		if FormFields.ItemByName("B3_Start_"&RowNum).toDate < FormFields.ItemByName("A5_Start_"&RowNum).toDate then
			form.setError "Data B3 negali būti ankstesnė už A5 "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B3_Start_"&RowNum, "A5_Start_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
	end if

	if FormFields.ItemByName("A6_End_"&RowNum).value <> "" and FormFields.ItemByName("B4_End_"&RowNum).value <> "" then
		if FormFields.ItemByName("B4_End_"&RowNum).toDate > FormFields.ItemByName("A6_End_"&RowNum).toDate then
			form.setError "Data B4 negali būti vėlesnė už A6 "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B4_End_"&RowNum, "A6_End_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
	end if
	
	if FormFields.ItemByName("A5_Start_"&RowNum).value <> "" and FormFields.ItemByName("B5_Start_"&RowNum).value <> "" then
		if FormFields.ItemByName("B5_Start_"&RowNum).toDate < FormFields.ItemByName("A5_Start_"&RowNum).toDate then
			form.setError "Data B5 negali būti ankstesnė už A5 "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B5_Start_"&RowNum, "A5_Start_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
	end if

	if FormFields.ItemByName("A6_End_"&RowNum).value <> "" and FormFields.ItemByName("B6_End_"&RowNum).value <> "" then
		if FormFields.ItemByName("B6_End_"&RowNum).toDate > FormFields.ItemByName("A6_End_"&RowNum).toDate then
			form.setError "Data B6 negali būti vėlesnė už A6 "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B6_End_"&RowNum, "A6_End_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
	end if
	
	for i = 1 to 3
		if FormFields.ItemByName("B1_Start_"&i&"_"&RowNum).value <> "" and FormFields.ItemByName("B2_End_"&i&"_"&RowNum).value <> "" then
			if FormFields.ItemByName("B1_Start_"&i&"_"&RowNum).toDate > FormFields.ItemByName("B2_End_"&i&"_"&RowNum).toDate then
				form.setError "Pradžios data negali būti vėlesnė, negu pabaigos "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B2_End_"&i&"_"&RowNum, "B1_Start_"&i&"_"&RowNum), 0), EL_ERROR
				Exit Function
			end if
			if FormFields.ItemByName("B5_Start_"&RowNum).value <> "" and FormFields.ItemByName("B6_End_"&RowNum).value <> "" then
				if (FormFields.ItemByName("B5_Start_"&RowNum).toDate >= FormFields.ItemByName("B1_Start_"&i&"_"&RowNum).toDate and FormFields.ItemByName("B5_Start_"&RowNum).toDate <= FormFields.ItemByName("B2_End_"&i&"_"&RowNum).toDate) or (FormFields.ItemByName("B6_End_"&RowNum).toDate >= FormFields.ItemByName("B1_Start_"&i&"_"&RowNum).toDate and FormFields.ItemByName("B6_End_"&RowNum).toDate <= FormFields.ItemByName("B2_End_"&i&"_"&RowNum).toDate)	then
					form.setError "Darbdavio mokėjimas neturi sutapti su periodu, kada apdraustasis dirbo "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B2_End_"&i&"_"&RowNum, "B1_Start_"&i&"_"&RowNum, "B5_Start_"&RowNum, "B6_End_"&RowNum), 0), EL_ERROR
					Exit Function
				end if
			end if
		end if	
	next
	
	if FormFields.ItemByName("B3_Start_"&RowNum).value <> "" and FormFields.ItemByName("B4_End_"&RowNum).value <> "" then
		if FormFields.ItemByName("B3_Start_"&RowNum).toDate > FormFields.ItemByName("B4_End_"&RowNum).toDate then
			form.setError "Pabaigos data negali būti ankstesnė už pradžią "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B3_Start_"&RowNum, "B4_End_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
	end if
	
	if FormFields.ItemByName("B5_Start_"&RowNum).value <> "" and FormFields.ItemByName("B6_End_"&RowNum).value <> "" then
		if FormFields.ItemByName("B5_Start_"&RowNum).toDate > FormFields.ItemByName("B6_End_"&RowNum).toDate then
			form.setError "Pabaigos data negali būti ankstesnė už pradžią "&PageNum&" lapas ", GetFieldObjects(FormFields, Array("B5_Start_"&RowNum, "B6_End_"&RowNum), 0), EL_ERROR
			Exit Function
		end if
	end if
		
'----
	if FormFields.ItemByName("A7_"&RowNum).value <> "1" then
			if FormFields.ItemByName("B5_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("B6_End_"&RowNum).value = "" then
				form.setError "Jei B6 užpildytas, privalo būti užpildytas ir B5", GetFieldObjects(FormFields, Array("B5_Start_"&RowNum, "B6_End_"&RowNum), 0), EL_ERROR
				Exit Function
			end if

		
		if Not FormFields.ItemByName("B5_Start_"&RowNum).value = "" AND Not FormFields.ItemByName("B6_End_"&RowNum).value = "" then
			if DateDiff("d", FormFields.ItemByName("B5_Start_"&RowNum).toDate, FormFields.ItemByName("B6_End_"&RowNum).toDate) < 0 then
				form.setError "B6 negali būti ankstesnė už B5", GetFieldObjects(FormFields, Array("B5_Start_"&RowNum, "B6_End_"&RowNum), 0), EL_ERROR
				Exit Function
			end if
			
			'EGS-241
			if DateDiff("d", FormFields.ItemByName("B5_Start_"&RowNum).toDate, FormFields.ItemByName("B6_End_"&RowNum).toDate) = 0 OR DateDiff("d", FormFields.ItemByName("B5_Start_"&RowNum).toDate, FormFields.ItemByName("B6_End_"&RowNum).toDate) > 1 then
				form.setError "Jei pašalpą už darbdavio lėšų skiriate už abi pirmąsias kalendorines dienas, data B6 turi būti viena diena vėlesnė už B5. Jei už vieną dieną - šis laukas turi būti tuščias", GetFieldObjects(FormFields, Array("B6_End_"&RowNum, "B5_Start_"&RowNum), 0), EL_ERROR
				Exit Function
			end if
		end if
	
		if FormFields.ItemByName("B6_End_"&RowNum).value = "" OR FormFields.ItemByName("B7_PaymentSum_"&RowNum).value = "" OR FormFields.ItemByName("B7_PaymentSum_"&RowNum).ToDecimal <= 0 then
			if FormFields.ItemByName("ReasonCode_"&RowNum).value = "" then
				form.setError "Kai nenurodyta suma B7 ir datos B5, B6 reikia nurodyti neskyrimo priežastį B8 "&PageNum&" lape", GetFieldObjects(formFields, Array("ReasonCode_"&RowNum, "ReasonText_"&RowNum), 0), EL_ERROR
			end if
		end if
		
		'if FormFields.ItemByName("B5_Start_"&RowNum).value <> "" and FormFields.ItemByName("A5_Start_"&RowNum).value <> "" then
		'	if abs(DateDiff("d", FormFields.ItemByName("A5_Start_"&RowNum).toDate, FormFields.ItemByName("B5_Start_"&RowNum).toDate)) = 0 or (abs(DateDiff("d", FormFields.ItemByName("A5_Start_"&RowNum).toDate, FormFields.ItemByName("B5_Start_"&RowNum).toDate)) = 1 and FormFields.ItemByName("B6_End_"&RowNum).value = "") then
		'		form.setError "Darbdavys turi mokėti tik už 2 pirmąsias nedarbingumo dienas", GetFieldObjects(FormFields, Array("A5_Start_"&RowNum, "B5_Start_"&RowNum, "B6_End_"&RowNum), 0), EL_ERROR
		'		Exit Function
		'	end if
		'end if

		if FormFields.ItemByName("B5_Start_"&RowNum).value <> "" and FormFields.ItemByName("A5_Start_"&RowNum).value <> "" then
			if DateDiff("d", FormFields.ItemByName("A5_Start_"&RowNum).toDate, FormFields.ItemByName("B5_Start_"&RowNum).toDate) > 1 then
			  form.setError "Darbdavys turi mokėti tik už 2 pirmąsias nedarbingumo dienas", GetFieldObjects(FormFields, Array("B5_Start_"&RowNum, "A5_Start_"&RowNum), 0), EL_ERROR
			end if
		end if
		
		if FormFields.ItemByName("B6_End_"&RowNum).value <> "" and FormFields.ItemByName("A5_Start_"&RowNum).value <> "" then
			if DateDiff("d", FormFields.ItemByName("A5_Start_"&RowNum).toDate, FormFields.ItemByName("B6_End_"&RowNum).toDate) > 1 then
				form.setError "Data B6 turi sutapti su antrąja nedarbingumo diena", GetFieldObjects(FormFields, Array("A5_Start_"&RowNum, "B6_End_"&RowNum), 0), EL_ERROR
			end if
		end if
	end if
	
	if FormFields.ItemByName("ReasonCode_"&RowNum).value <> "" then
		if FormFields.ItemByName("B5_Start_"&RowNum).value <> "" and FormFields.ItemByName("B6_End_"&RowNum).value <> "" then
			if FormFields.ItemByName("B7_PaymentSum_"&RowNum).value <> "" and FormFields.ItemByName("ReasonCode_"&RowNum).value <> "06" then
				form.setError "Jeigu ligos pašalpa priskaičiuota už abi pirmąsias laikinojo nedarbingumo dienas, laukelis B8 nepildomas "&PageNum&" lape", GetFieldObjects(formFields, Array("ReasonCode_"&RowNum, "ReasonText_"&RowNum), 0), EL_ERROR
			end if
			
			if FormFields.ItemByName("B7_PaymentSum_"&RowNum).value = "" then
				form.setError "Įrašykite priskaičiuotą ligos pašalpos sumą iš darbdavio lėšų "&PageNum&" lape", GetFieldObjects(formFields, Array("B7_PaymentSum_"&RowNum), 0), EL_ERROR
			end if
		end if
		
		if FormFields.ItemByName("B6_End_"&RowNum).value <> "" and FormFields.ItemByName("B7_PaymentSum_"&RowNum).value <> "" and FormFields.ItemByName("B5_Start_"&RowNum).value = "" then
			form.setError "Įrašykite dienos, už kurią apskaičiavote ligos pašalpos sumą iš darbdavio lėšų, datą į laukelį B5 "&PageNum&" lape", GetFieldObjects(formFields, Array("B5_Start_"&RowNum), 0), EL_ERROR
		end if
		
		if FormFields.ItemByName("B7_PaymentSum_"&RowNum).value <> "" and FormFields.ItemByName("B5_Start_"&RowNum).value = "" and FormFields.ItemByName("B6_End_"&RowNum).value = "" then				
			form.setError "Įrašykite dienų, už kurias apskaičiavote ligos pašalpos sumą iš darbdavio lėšų, datas laukeliuose B5 ir B6 dienas arba nepildykite laukelio B7 "&PageNum&" lape", GetFieldObjects(formFields, Array("B5_Start_"&RowNum,"B6_End_"&RowNum,"B7_PaymentSum_"&RowNum), 0), EL_ERROR
		end if
		
		if FormFields.ItemByName("B5_Start_"&RowNum).value <> "" and FormFields.ItemByName("B7_PaymentSum_"&RowNum).value = "" and FormFields.ItemByName("B6_End_"&RowNum).value = "" then
			form.setError "Įrašykite priskaičiuotą ligos pašalpos sumą iš darbdavio lėšų į laukelį B7 arba nepildykite laukelio B5 "&PageNum&" lape", GetFieldObjects(formFields, Array("B7_PaymentSum_"&RowNum,"B5_Start_"&RowNum), 0), EL_ERROR
		end if
		
		if FormFields.ItemByName("B6_End_"&RowNum).value <> "" and FormFields.ItemByName("B7_PaymentSum_"&RowNum).value = "" and FormFields.ItemByName("B5_Start_"&RowNum).value = "" then
			form.setError "Įrašykite dienos, už kurią apskaičiavote ligos pašalpos sumą iš darbdavio lėšų, datą į laukelį B5 ir užpildykite laukelį B7 arba nepildykite laukelio B6 "&PageNum&" lape", GetFieldObjects(formFields, Array("B5_Start_"&RowNum,"B6_End_"&RowNum,"B7_PaymentSum_"&RowNum), 0), EL_ERROR
		end if
  end if

	if FormFields.ItemByName("A7_"&RowNum).value <> "1" then
		if DateDiff("d", FormFields.ItemByName("B5_Start_"&RowNum).toDate, FormFields.ItemByName("DocDate").toDate) < 0 then form.setError "Pašalpos data negali būti vėlesnė už dokumento pildymo datą", GetFieldObjects(FormFields, Array("B5_Start_"&RowNum), 0), EL_ERROR
		if DateDiff("d", FormFields.ItemByName("B6_End_"&RowNum).toDate, FormFields.ItemByName("DocDate").toDate) < 0 then form.setError "Pašalpos data negali būti vėlesnė už dokumento pildymo datą", GetFieldObjects(FormFields, Array("B6_End_"&RowNum), 0), EL_ERROR
	end if
	if FormFields.ItemByName("ReasonCode_"&RowNum).value = "06" and FormFields.ItemByName("ReasonText_"&RowNum).value = "" then
		form.setError "Būtina įrašyti priežastis", GetFieldObjects(formFields, Array("ReasonCode_"&RowNum, "ReasonText_"&RowNum), 0), EL_ERROR
	end if
	
	if FormFields.ItemByName("DocDate").toDate >= DateValue("2022-04-01") and FormFields.ItemByName("A5_Start_"&RowNum).toDate >= DateValue("2022-04-01") then
	  if FormFields.ItemByName("ReasonCode_"&RowNum).value = "01" then
		  form.setError "01 priežastį galima pasirinkti iki 2022-04-01", GetFieldObjects(formFields, Array("ReasonCode_"&RowNum, "DocDate", "A5_Start_"&RowNum), 0), EL_ERROR
	  end if
	end if
	
	ValidateRowNPSD2 = true
End function

Function ValidateRowSAM3SDM(FormFields, PageNum, RowNum)
	dim insSum, paySum
	ValidateRowSAM3SDM = false
	
	If FormFields.ItemByName("InsIncomeSum_"&RowNum&"_2").value = "" then
		form.setError "Neįvesti būtini nauji apdraustojo duomenys PT-SAM3SD-M priede", GetFieldObjects(formFields, Array("InsIncomeSum_"&RowNum&"_2", "PaymentSum_"&RowNum&"_2"), 0), EL_ERROR
		Exit Function
	end if
	'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_1").value = "" and FormFields.ItemByName("InsuranceNumber_1").value <> "") or (FormFields.ItemByName("InsuranceSeries_1").value <> "" and FormFields.ItemByName("InsuranceNumber_1").value = "")) or (FormFields.ItemByName("InsuranceSeries_1").value = "" and FormFields.ItemByName("InsuranceNumber_1").value = "" and FormFields.ItemByName("PersonCode_1").value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo 1 eilutėje", GetFieldObjects(FormFields, RowFieldsReqSAM3SDM_2, 1), EL_ERROR
	end if
	ValidateRowSAM3SDM = true
End function

Function ValidateA5(FormFields)
	dim i, j, k
	ValidateA5 = false
	
	for i = 7 to 12
		if Not FormFields.ItemByName("A5_Series_"&Cstr(i)).value = "" OR Not CustCDbl(FormFields.ItemByName("A5_Number_"&Cstr(i))) = 0 then
			if Not FormFields.ItemByName("A5_Series_"&Cstr(i)).value = "" AND Not CustCDbl(FormFields.ItemByName("A5_Number_"&Cstr(i))) = 0 then
				'do nothing
			else
				form.setError "Turi būti įvesti ir serija, ir numeris", GetFieldObjects(FormFields, Array("A5_Series_"&Cstr(i), "A5_Number_"&Cstr(i)), 0), EL_ERROR
				ValidateA5 = false
				exit function
			end if
		end if
	next
	for j = 7 to 12
		if FormFields.ItemByName("A5_Series_"&Cstr(j)).value = "" then
			for k = j to 12
				if Not FormFields.ItemByName("A5_Series_"&Cstr(k)).value = "" then
					if k <= 9 then
						form.setError "Laukai vedami eilės tvarka iš viršaus į apačią", GetFieldObjects(FormFields, Array("A5_Series_7", "A5_Number_7", "A5_Series_8", "A5_Number_8", "A5_Series_9", "A5_Number_9"), 0), EL_ERROR
						ValidateA5 = false
						exit function
					else
						form.setError "Laukai vedami eilės tvarka iš viršaus į apačią", GetFieldObjects(FormFields, Array("A5_Series_7", "A5_Number_7", "A5_Series_8", "A5_Number_8", "A5_Series_9", "A5_Number_9", "A5_Series_"&Cstr(k), "A5_Number_"&Cstr(k)), 0), EL_ERROR
						ValidateA5 = false
						exit function
					end if
				end if
			next
		end if
	next
	ValidateA5 = true
End Function

Function ValidateA8(FormFields)
	dim i
	ValidateA8 = false
	
	for i = 3 to 4
		if Not FormFields.ItemByName("A8_Series_"&Cstr(i)).value = "" OR Not CustCDbl(FormFields.ItemByName("A8_Number_"&Cstr(i))) = 0 then
			if Not FormFields.ItemByName("A8_Series_"&Cstr(i)).value = "" AND Not CustCDbl(FormFields.ItemByName("A8_Number_"&Cstr(i))) = 0 then
				'do nothing
			else
				form.setError "Turi būti įvesti ir serija, ir numeris", GetFieldObjects(FormFields, Array("A8_Series_"&Cstr(i), "A8_Number_"&Cstr(i)), 0), EL_ERROR
				ValidateA8 = false
				exit function
			end if
		end if
	next
	if FormFields.ItemByName("A8_Series_3").value = "" AND Not FormFields.ItemByName("A8_Series_4").value = "" then
		form.setError "Laukai vedami eilės tvarka iš kairės į dešinę", GetFieldObjects(FormFields, Array("A8_Series_3", "A8_Number_3", "A8_Series_4", "A8_Number_4"), 0), EL_ERROR
		ValidateA8 = false
		exit function
	end if
	ValidateA8 = true
End function

Function RecalcSumDiff(FormFields, PageNum)
	dim FormFields0
	dim InsIncomeSumDiff, PaymentSumDiff, before, after
	
	set FormFields0 = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	if FormFields.ItemByName("FormCode").value = "PT-2-SD" OR FormFields.ItemByName("FormCode").value = "PT-13-SD" OR FormFields.ItemByName("FormCode").value = "PT-SAM3SD" OR FormFields.ItemByName("FormCode").value = "PT-SAM3SDP" then
		before = CustCdbl(FormFields.ItemByName("InsIncomeSum_1"))
		after = CustCdbl(FormFields.ItemByName("InsIncomeSum_2"))
		InsIncomeSumDiff = CustCdbl(FormFields0.ItemByName("InsIncomeSumDiff"))
		FormFields0.ItemByName("InsIncomeSumDiff").setCheckValue(Form.FormatDecimal(InsIncomeSumDiff+after-before))
	end if
	if FormFields.ItemByName("FormCode").value = "PT-2-SD" OR FormFields.ItemByName("FormCode").value = "PT-13-SD" OR FormFields.ItemByName("FormCode").value = "PT-SAM3SD" OR FormFields.ItemByName("FormCode").value = "PT-SAM3SDP" then
		before = CustCdbl(FormFields.ItemByName("PaymentSum_1"))
		after = CustCdbl(FormFields.ItemByName("PaymentSum_2"))
		PaymentSumDiff = CustCdbl(FormFields0.ItemByName("PaymentSumDiff"))
		FormFields0.ItemByName("PaymentSumDiff").setCheckValue(Form.FormatDecimal(PaymentSumDiff+after-before))
	end if
	
End Function

Function TikrintiUnikalius(formFields)
	dim PersonArrayA5(6), PersonArrayA8(2), i, j, m, n, m1, n1, CountA5, CountA8
	TikrintiUnikalius = false
	CountA5 = 0
	CountA8 = 0
	m = 0
	n = 0
	
	for i = 1 to 6
		PersonArrayA5(i) = ""
		if not formFields.ItemByName("A5_Series_"&Cstr(i+6)).value = "" then
			PersonArrayA5(i) = formFields.ItemByName("A5_Series_"&Cstr(i+6)).value & formFields.ItemByName("A5_Number_"&Cstr(i+6)).value
			CountA5 = CountA5 + 1
		end if
	next
	
	for j = 1 to 2
		PersonArrayA8(j) = ""
		if not formFields.ItemByName("A8_Series_"&Cstr(j+2)).value = "" then
			PersonArrayA8(j) = formFields.ItemByName("A8_Series_"&Cstr(j+2)).value & formFields.ItemByName("A8_Number_"&Cstr(j+2)).value
			CountA8 = CountA8 + 1
		end if
	next

	for m = 1 to CountA5
		if not PersonArrayA5(m) = "" then
			for m1 = m+1 to CountA5
				if PersonArrayA5(m) = PersonArrayA5(m1) then
					TikrintiUnikalius = false
					form.setError "SD numeriai turi būti unikalūs", GetFieldObjects(FormFields, Array("A5_Series_"&Cstr(m+6), "A5_Number_"&Cstr(m+6), "A5_Series_"&Cstr(m1+6), "A5_Number_"&Cstr(m1+6)), 0), EL_ERROR
					Exit Function
				end if
			next
		end if
	next

	for n = 1 to CountA8
		if not PersonArrayA8(n) = "" then
			for n1 = n+1 to CountA8
				if PersonArrayA8(n) = PersonArrayA8(n1) then
					TikrintiUnikalius = false
					form.setError "SD numeriai turi būti unikalūs", GetFieldObjects(FormFields, Array("A8_Series_"&Cstr(n+2), "A8_Number_"&Cstr(n+2), "A8_Series_"&Cstr(n1+2), "A8_Number_"&Cstr(n1+2)), 0), EL_ERROR
					Exit Function
				end if
			next
		end if
	next
	
	TikrintiUnikalius = true

End Function

Function ValidateReason1SD(FormFields, PageNum, RowNum, RsnCode, RsnCodeDet)
	dim rsnText
	dim rsnTextExist
	dim rsnDetText
	dim rsnDetTypeText
	
	ValidateReason1SD = false
	
	if RsnCode = "05" or RsnCode = "06" or ((RsnCode = "01" or RsnCode = "19" or RsnCode = "96") and DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2017-07-01")) or ((RsnCode = "14" or RsnCode = "22") and DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2019-01-01")) then
		rsnDetText = ucase(GetReasonDetTextByCode1SD(RsnCode, FormFields.ItemByName("ReasonDetCode_"&RowNum).value))
		if not (ucase(FormFields.ItemByName("ReasonDetText_"&RowNum).value) = rsnDetText) then
			FormFields.ItemByName("ReasonDetText_"&RowNum).SetCheckValue(rsnDetText)
		end if
	end if
	
	if (RsnCodeDet = "03" or RsnCodeDet = "06" or RsnCodeDet = "07" or RsnCodeDet = "08") and DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2017-07-01") then
		rsnDetTypeText = ucase(GetReasonDetTypeTextByCode1SD(RsnCodeDet, FormFields.ItemByName("ReasonDetTypeCode_"&RowNum).value))
		if not (ucase(FormFields.ItemByName("ReasonDetTypeText_"&RowNum).value) = rsnDetTypeText) then
			FormFields.ItemByName("ReasonDetTypeText_"&RowNum).SetCheckValue(rsnDetTypeText)
		end if
	end if
	
	rsnText = ucase(GetReasonTextByCode1SD(RsnCode))
	rsnTextExist = ucase(FormFields.ItemByName("ReasonText_"&RowNum).value)
	if not (rsnTextExist = rsnText) then
		if not (RsnCode = ReasonMisc1SD) then
			FormFields.ItemByName("ReasonText_"&RowNum).SetCheckValue(rsnText)
			rsnTextExist = rsnText
		end if
	end if
	
	if trim(rsnTextExist) = "" then
		form.setError "Nenurodytas pranešimo pateikimo priežasties atvejis PT-1-SD priede", Array(FormFields.ItemByName("ReasonText_"&RowNum)), EL_ERROR
		exit function
	end if
	
	if RsnCode = "14" or RsnCode = "22" then
	  if DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2019-01-01") then
			If Not CompleteFieldSet(FormFields, GetFieldNames(Array("ReasonDetCode_","ReasonDetText_"), RowNum), False) then
				form.setError "Nenurodytas pranešimo pateikimo priežasties patikslinimas PT-1-SD priede", GetFieldObjects(FormFields, Array("ReasonDetCode_","ReasonDetText_"), RowNum), EL_ERROR
				Exit Function
			end if
		else
		  If CompleteFieldSetAny(FormFields, GetFieldNames(Array("ReasonDetCode_","ReasonDetText_"), RowNum)) then
				form.setError "Nurodytai pranešimo pateikimo priežasčiai patikslinimo nurodyti nereikia iki 2018-12-31 "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonDetCode_","ReasonDetText_"), RowNum), EL_ERROR
				Exit Function
			end if
		end if
	else
		if rsnCode = "05" or rsnCode = "06" or rsnCode = "10" or rsnCode = "11" or ((RsnCode = "01" or RsnCode = "19" or RsnCode = "96") and DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2017-07-01"))  then
			If Not CompleteFieldSet(FormFields, GetFieldNames(Array("ReasonDetCode_","ReasonDetText_"), RowNum), False) then
				form.setError "Nenurodytas pranešimo pateikimo priežasties patikslinimas PT-1-SD priede", GetFieldObjects(FormFields, Array("ReasonDetCode_","ReasonDetText_"), RowNum), EL_ERROR
				Exit Function
			end if
		else
			If CompleteFieldSetAny(FormFields, GetFieldNames(Array("ReasonDetCode_","ReasonDetText_"), RowNum)) then
				if DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2017-07-01") then
					form.setError "Nurodytai pranešimo pateikimo priežasčiai patikslinimo nurodyti nereikia "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonDetCode_","ReasonDetText_"), RowNum), EL_ERROR
					Exit Function
				else
					form.setError "Nurodytai pranešimo pateikimo priežasčiai patikslinimo nurodyti nereikia iki 2017-06-30 "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonDetCode_","ReasonDetText_"), RowNum), EL_ERROR
					Exit Function
				end if
			end if	
		end if
	end if
	
	if DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2017-07-01") then
		if RsnCodeDet = "03" or RsnCodeDet = "06" or RsnCodeDet = "07" or RsnCodeDet = "08" then
			If Not CompleteFieldSet(FormFields, GetFieldNames(Array("ReasonDetTypeCode_","ReasonDetTypeText_"), RowNum), False) then
				form.setError "Nenurodytas darbo sutarties rūšies kodo patikslinimas "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonDetTypeCode_","ReasonDetTypeText_"), RowNum), EL_ERROR
				Exit Function
			end if
		else
		  if RsnCode = "05" or RsnCode = "06" then
				if RsnCodeDet <> "" then
					if Not CompleteFieldSet(FormFields, GetFieldNames(Array("ReasonDetTypeCode_","ReasonDetTypeText_"), RowNum), False) then
						form.setError "Nenurodytas darbo sutarties rūšies kodo patikslinimas "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonDetTypeCode_","ReasonDetTypeText_"), RowNum), EL_ERROR
						Exit Function
					end if
				end if
			else
				If CompleteFieldSetAny(FormFields, GetFieldNames(Array("ReasonDetTypeCode_","ReasonDetTypeText_"), RowNum)) then
					form.setError "Nurodytai pranešimo pateikimo priežasčiai darbo sutarties rūšies kodo patikslinimo nurodyti nereikia "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonDetTypeCode_","ReasonDetTypeText_"), RowNum), EL_ERROR
					Exit Function
				end if
			end if
		end if
	end if
	
	if rsnCode = "96" and DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) < DateValue("2017-07-01") then
		form.setError "96 pateikimo priežastį pasirinkti galima tik tada, kai priėmimo data yra 2017-07-01 ir vėlesnė "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonCode_","InsuranceStartDate_"), RowNum), EL_ERROR
		Exit Function
	end if
	
	if rsnCode = "21" then 
	  if DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) < DateValue("2017-07-01") then
		  form.setError "21 pateikimo priežastį pasirinkti galima tik tada, kai priėmimo data yra 2017-07-01 ir vėlesnė "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonCode_","InsuranceStartDate_"), RowNum), EL_ERROR
		  Exit Function
		end if
		
		if DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) > DateValue("2021-12-31") then
		  form.setError "21 pateikimo priežastį pasirinkti galima tik tada, kai priėmimo data yra iki 2021-12-31 "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonCode_","InsuranceStartDate_"), RowNum), EL_ERROR
		  Exit Function
		end if
	end if
	
	if rsnCode = "23" and DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) < DateValue("2022-01-01") then
		form.setError "23 pateikimo priežastį pasirinkti galima tik tada, kai priėmimo data yra 2022-01-01 ir vėlesnė "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonCode_","InsuranceStartDate_"), RowNum), EL_ERROR
		Exit Function
	end if
	
	ValidateReason1SD = true
End FUnction

Function ValidateReason2SD(FormFields, PageNum, RowNum, RsnCode)
	dim rsnText
	dim rsnDetCode
	dim rsnTextExist
	dim rsnDetText
	
	ValidateReason2SD = false

	if RsnCode = "05" or RsnCode = "06" then
		rsnDetText = ucase(GetReasonDetTextByCode2SD(RsnCode, FormFields.ItemByName("ReasonDetCode_"&RowNum).value))
		if not (ucase(FormFields.ItemByName("ReasonDetText_"&RowNum).value) = rsnDetText) then
			FormFields.ItemByName("ReasonDetText_"&RowNum).SetCheckValue(rsnDetText)
		end if
	end if
	
	rsnText = ucase(GetReasonTextByCode2SD(RsnCode))
	rsnTextExist = ucase(FormFields.ItemByName("ReasonText_"&RowNum).value)
	if not (rsnTextExist = rsnText) then
		if not (RsnCode = ReasonMisc2SD) then
			FormFields.ItemByName("ReasonText_"&RowNum).SetCheckValue(rsnText)
			rsnTextExist = rsnText
		end if
	end if
	
	if trim(rsnTextExist) = "" then
		form.setError "Nenurodytas pranešimo pateikimo priežasties atvejis PT-2-SD priede", Array(FormFields.ItemByName("ReasonText_"&RowNum)), EL_ERROR
		exit function
	end if
	
	if rsnCode = "02" or rsnCode = "05" or rsnCode = "06" or rsnCode = "10" or rsnCode = "11" or rsnCode = "16" then
		if Not FormFields.ItemByName("InsuranceEndDate_"&RowNum).value = "" then
			if rsnCode = "02" AND DateValue(FormFields.ItemByName("InsuranceEndDate_"&RowNum).toDate) < DateValue("2009-12-01") then
				'do nothing
			else
				If Not CompleteFieldSet(FormFields, GetFieldNames(Array("ReasonDetCode_","ReasonDetText_"), RowNum), False) then
					form.setError "Nenurodytas pranešimo pateikimo priežasties patikslinimas PT-2-SD priede", GetFieldObjects(FormFields, Array("ReasonDetCode_","ReasonDetText_"), RowNum), EL_ERROR
					Exit Function
				end if
			end if
		end if
	else
		If CompleteFieldSetAny(FormFields, GetFieldNames(Array("ReasonDetCode_","ReasonDetText_"), RowNum)) then
			form.setError "Nurodytai pranešimo pateikimo priežasčiai patikslinimo nurodyti nereikia PT-2-SD priede", GetFieldObjects(FormFields, Array("ReasonDetCode_","ReasonDetText_"), RowNum), EL_ERROR
			Exit Function
		end if
	end if
	
	if rsnCode = "96" and FormFields.ItemByName("InsuranceEndDate_"&RowNum).todate < DateValue("2017-06-30") then
		form.setError "96 pateikimo priežastį pasirinkti galima tik tada, kai atleidimo data yra 2017-06-30 ir vėlesnė "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonCode_","InsuranceEndDate_"), RowNum), EL_ERROR
		Exit Function
	end if
	
	if rsnCode = "21" then 
	  if FormFields.ItemByName("InsuranceEndDate_"&RowNum).todate < DateValue("2017-07-01") then
		  form.setError "21 pateikimo priežastį pasirinkti galima tik tada, kai atleidimo data yra 2017-07-01 ir vėlesnė "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonCode_","InsuranceEndDate_"), RowNum), EL_ERROR
		  Exit Function
		end if
		
		if FormFields.ItemByName("InsuranceEndDate_"&RowNum).todate > DateValue("2021-12-31") then
		  form.setError "21 pateikimo priežastį pasirinkti galima tik tada, kai atleidimo data yra iki 2021-12-31 "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonCode_","InsuranceEndDate_"), RowNum), EL_ERROR
		  Exit Function
		end if
	end if
	
	if rsnCode = "23" and FormFields.ItemByName("InsuranceEndDate_"&RowNum).todate < DateValue("2022-01-01") then
		form.setError "23 pateikimo priežastį pasirinkti galima tik tada, kai atleidimo data yra 2022-01-01 ir vėlesnė "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonCode_","InsuranceEndDate_"), RowNum), EL_ERROR
		Exit Function
	end if

	ValidateReason2SD = true
End FUnction

Function ValidateReason9SD(FormFields, PageNum, RowNum, RsnCode)
	dim rsnText
	dim rsnTextExist
	
	ValidateReason9SD = false
	
	rsnText = ucase(GetReasonTextByCode9SD(RsnCode))
	rsnTextExist = ucase(FormFields.ItemByName("ReasonText_"&RowNum).value)
	if not (rsnTextExist = rsnText) then
		FormFields.ItemByName("ReasonText_"&RowNum).SetCheckValue(rsnText)
		rsnTextExist = rsnText
	end if
	
	if trim(rsnTextExist) = "" then
		form.setError "Nenurodytas pranešimo pateikimo priežasties atvejis PT-9-SD priede", Array(FormFields.ItemByName("ReasonText_"&RowNum)), EL_ERROR
		exit function
	end if
		
	ValidateReason9SD = true
End FUnction

Function ValidateReason12SD(FormFields, PageNum, RowNum, RsnCode)
	dim rsnText
	dim rsnTextExist
	
	ValidateReason12SD = false
	
	rsnText = ucase(GetReasonTextByCode12SD(RsnCode))
	rsnTextExist = ucase(FormFields.ItemByName("ReasonText_"&RowNum).value)
	if not (rsnTextExist = rsnText) then
		if not (RsnCode = ReasonMisc12SD) then
			FormFields.ItemByName("ReasonText_"&RowNum).SetCheckValue(rsnText)
			rsnTextExist = rsnText
		end if
	end if
	
	if trim(rsnTextExist) = "" then
		form.setError "Nenurodytas pranešimo pateikimo priežasties atvejis PT-12-SD priede", Array(FormFields.ItemByName("ReasonText_"&RowNum)), EL_ERROR
		exit function
	end if
		
	ValidateReason12SD = true
End FUnction

Function ValidateReason13SD(FormFields, PageNum, RowNum, RsnCode)
	dim rsnText
	dim rsnTextExist
	dim rsnDetText
	
	ValidateReason13SD = false
	
	rsnText = ucase(GetReasonTextByCode13SD(RsnCode))
	rsnTextExist = ucase(FormFields.ItemByName("ReasonText_"&RowNum).value)
	if not (rsnTextExist = rsnText) then
		if not (RsnCode = ReasonMisc13SD) then
			FormFields.ItemByName("ReasonText_"&RowNum).SetCheckValue(rsnText)
			rsnTextExist = rsnText
		end if
	end if
	
	if trim(rsnTextExist) = "" then
		form.setError "Nenurodytas pranešimo pateikimo priežasties atvejis PT-13-SD priede", Array(FormFields.ItemByName("ReasonText_"&RowNum)), EL_ERROR
		exit function
	end if
	
	ValidateReason13SD = true
End FUnction

Function ValidateReasonSAM3SDP(FormFields, PageNum, RowNum, RsnCode)
	dim rsnText
	dim rsnTextExist
	
	ValidateReasonSAM3SDP = false
	
	rsnText = ucase(GetReasonTextByCodeSAM3SDP(RsnCode))
	rsnTextExist = ucase(FormFields.ItemByName("ReasonText_"&RowNum).value)
	if not (rsnTextExist = rsnText) then
		if not (RsnCode = ReasonMiscSAM3SDP) then
			FormFields.ItemByName("ReasonText_"&RowNum).SetCheckValue(rsnText)
			rsnTextExist = rsnText
		end if
	end if
	
	if trim(rsnTextExist) = "" then
		form.setError "Nenurodytas pranešimo pateikimo priežasties atvejis PT-SAM3SDP priede", Array(FormFields.ItemByName("ReasonText_"&RowNum)), EL_ERROR
		exit function
	end if

	if RsnCode = "04" and FormFields.ItemByName("PeriodStartDate_"&RowNum).todate > DateValue("2021-12-31") then
		form.setError RsnCode&" pateikimo priežastį pasirinkti galima tik tada, kai laikotarpio pradžia yra iki 2021-12-31 "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("PeriodStartDate_","ReasonCode_"), RowNum), EL_ERROR
		Exit Function
	end if
	
	if RsnCode = "07" and FormFields.ItemByName("PeriodStartDate_"&RowNum).todate < DateValue("2017-12-01") then
		form.setError "07 pateikimo priežastį pasirinkti galima tik tada, kai laikotarpio pradžia yra 2017-12-01 ir vėlesnė "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("PeriodStartDate_","ReasonCode_"), RowNum), EL_ERROR
		Exit Function
	end if
		
	if RsnCode = "09" or RsnCode = "10" then
	  if FormFields.ItemByName("PeriodStartDate_"&RowNum).todate < DateValue("2022-01-01") then
		  form.setError RsnCode&" pateikimo priežastį pasirinkti galima tik tada, kai laikotarpio pradžia yra 2022-01-01 ir vėlesnė "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("PeriodStartDate_","ReasonCode_"), RowNum), EL_ERROR
		  Exit Function
		end if
	end if
		
	ValidateReasonSAM3SDP = true
End FUnction

'== Common ESD functions ======================================================
Function CustCDbl(Field)
	if Cstr(Field.value) = "" then
		CustCDbl = 0
	else
		CustCDbl = Field.toDecimal
	end if
End Function

Function GetFieldNames(FieldNames, RowNum)
	dim i
	dim resultList
	dim suffix

	suffix = Cstr(RowNum)
	if RowNum = 0 then suffix = ""
	resultList = FieldNames
	for i=0 to UBound(FieldNames)
		resultList(i) = FieldNames(i) + suffix
	next

	GetFieldNames = resultList
End Function

Function GetFieldObjects(FormFields, FieldNames, RowNum)
	dim i
	dim resultList
	dim suffix

	redim resultList(Ubound(FieldNames))
	suffix = Cstr(RowNum)
	if RowNum = 0 then suffix = ""
	for i=0 to UBound(FieldNames)
		set resultList(i) = FormFields.ItemByName(FieldNames(i)+suffix)
	next

	GetFieldObjects = resultList
End Function

Sub SetOnChangedHandlers
	Call form.SetOnChangedHandlerEx("OnChangeRPTSD", Cstr(FormDefs(0)), "ReasonCode_1")
	Call form.SetOnChangedHandlerEx("OnChangeR1SD", Cstr(FormDefs(1)), "ReasonCode_2")
	Call form.SetOnChangedHandlerEx("OnChangeRD1SD", Cstr(FormDefs(1)), "ReasonDetCode_2")
	Call form.SetOnChangedHandlerEx("OnChangeRDT1SD", Cstr(FormDefs(1)), "ReasonDetTypeCode_2")
	Call form.SetOnChangedHandlerEx("OnChangeR2SD", Cstr(FormDefs(2)), "ReasonCode_2")
	Call form.SetOnChangedHandlerEx("OnChangeRD2SD", Cstr(FormDefs(2)), "ReasonDetCode_2")
	Call form.SetOnChangedHandlerEx("OnChangeA2SD", Cstr(FormDefs(2)), "LawActArticle_2")
	Call form.SetOnChangedHandlerEx("OnChangeP2SD", Cstr(FormDefs(2)), "LawActPart_2")
	Call form.SetOnChangedHandlerEx("OnChangeS2SD", Cstr(FormDefs(2)), "LawActSubsection_2")
	Call form.SetOnChangedHandlerEx("OnChangeR9SD", Cstr(FormDefs(3)), "ReasonCode_2")
	Call form.SetOnChangedHandlerEx("OnChangeR12SD", Cstr(FormDefs(4)), "ReasonCode_2")
	Call form.SetOnChangedHandlerEx("OnChangeR13SD", Cstr(FormDefs(5)), "ReasonCode_2")
	Call form.SetOnChangedHandlerEx("OnChangeRSAM3SDP", Cstr(FormDefs(7)), "ReasonCode_2")
	Call form.SetOnChangedHandlerEx("OnChangeRNPSD", Cstr(FormDefs(8)), "ReasonCode_2")
	Call form.SetOnChangedHandlerEx("OnChangeRNPSD2", Cstr(FormDefs(10)), "ReasonCode_2")
End sub

Sub ResetReasonOnMain
  Call OnChangeROnPTSD(FormDefs(0), 1)
	Call OnChangeROn1SD(FormDefs(1), 2)
	Call OnChangeROn2SD(FormDefs(2), 2)
	Call OnChangeROn9SD(FormDefs(3), 2)
	Call OnChangeROn12SD(FormDefs(4), 2)
	Call OnChangeROn13SD(FormDefs(5), 2)
	Call OnChangeROnSAM3SDP(FormDefs(7), 2)
	Call OnChangeROnNPSD(FormDefs(8), 2)
	Call OnChangeROnNPSD2(FormDefs(10), 2)
End Sub
'************** PT-SD **********************************
Sub OnChangeRPTSD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	if selectedCode = ReasonMisc then
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue("")
	else
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCodePTSD(selectedCode))
	end if
End Sub

Sub OnChangeROnPTSD(PageDefName, FieldIndex)
	dim pages, formFields
	dim selectedCode

	set pages = Form.GetPagesForTemplate(PageDefName)
	set formFields = pages.Item(1).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	if not selectedCode = ReasonMisc then Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCodePTSD(selectedCode))
End Sub

Function GetReasonListPTSD
	dim lstLine
	dim i

	for i=0 to UBound(ReasonList)
		if not lstLine = "" then lstLine = lstLine & "###"
		lstLine = lstLine & ReasonList(i)(0)&";"&ReasonList(i)(1)
	next

	GetReasonListPTSD = split(lstLine, "###")
End Function

Function GetReasonTextByCodePTSD(ReasonCode)
	dim i

	for i=0 to UBound(ReasonList)
		if ReasonList(i)(0) = ReasonCode then
			GetReasonTextByCodePTSD = ReasonList(i)(1)
			Exit Function
		end if
	next

	GetReasonTextByCodePTSD = ""
End Function

'************** PT-SD **********************************

'************* 1-SD ************************************
Function GetReasonTextByCode1SD(ReasonCode)
	dim i

	for i=0 to UBound(ReasonList1SD)
		if ReasonList1SD(i)(0) = ReasonCode then
			GetReasonTextByCode1SD = ReasonList1SD(i)(1)
			Exit Function
		end if
	next

	GetReasonTextByCode1SD = ""
End Function

Function GetReasonTextByCode1SDDet(ReasonCodeDet)
	dim i

	for i=0 to UBound(ReasonList1SDDet)
		if ReasonList1SDDet(i)(0) = ReasonCodeDet then
			GetReasonTextByCode1SDDet = ReasonList1SDDet(i)(1)
			Exit Function
		end if
	next

	GetReasonTextByCode1SDDet = ""
End Function

Function GetReasonDetTextByCode1SD(ReasonCode, ReasonDetCode)
	dim i, j

	for i=0 to UBound(ReasonList1SD)
		if ReasonList1SD(i)(0) = ReasonCode then
			for j=0 to UBound(ReasonList1SD(i)(2))
				if ReasonList1SD(i)(2)(j)(0) = ReasonDetCode then
					GetReasonDetTextByCode1SD = ReasonList1SD(i)(2)(j)(1)
					Exit Function
				end if
			next
		end if
	next

	GetReasonDetTextByCode1SD = ""
End Function

Function GetReasonDetTypeTextByCode1SD(ReasonCodeDet, ReasonDetTypeCode)
	dim i, j

	for i=0 to UBound(ReasonList1SDDet)
		if ReasonList1SDDet(i)(0) = ReasonCodeDet then
			for j=0 to UBound(ReasonList1SDDet(i)(2))
				if ReasonList1SDDet(i)(2)(j)(0) = ReasonDetTypeCode then
					GetReasonDetTypeTextByCode1SD = ReasonList1SDDet(i)(2)(j)(1)
					Exit Function
				end if
			next
		end if
	next

	GetReasonDetTypeTextByCode1SD = ""
End Function

Function GetReasonDetList1SD(ReasonCode)
	dim lstLine
	dim i, j

	for i=0 to UBound(ReasonList1SD)
		if ReasonList1SD(i)(0) = ReasonCode then
			for j=0 to UBound(ReasonList1SD(i)(2))
				if not lstLine = "" then lstLine = lstLine & "###"
				lstLine = lstLine & ReasonList1SD(i)(2)(j)(0)&";"&ReasonList1SD(i)(2)(j)(1)
			next
			GetReasonDetList1SD = split(lstLine, "###")
			Exit Function
		end if
	next

	GetReasonDetList1SD = Array("")
End Function

Function GetReasonDetTypeList1SD(ReasonCodeDet)
	dim lstLine
	dim i, j

	for i=0 to UBound(ReasonList1SDDet)
		if ReasonList1SDDet(i)(0) = ReasonCodeDet then
			for j=0 to UBound(ReasonList1SDDet(i)(2))
				if not lstLine = "" then lstLine = lstLine & "###"
				lstLine = lstLine & ReasonList1SDDet(i)(2)(j)(0)&";"&ReasonList1SDDet(i)(2)(j)(1)
			next
			GetReasonDetTypeList1SD = split(lstLine, "###")
			Exit Function
		end if
	next

	GetReasonDetTypeList1SD = Array("")
End Function

Sub OnChangeROn1SD(PageDefName, FieldIndex)
	dim pages, formFields
	dim selectedCode
	dim selectedCodeDet
	dim selectedCodeDetType
	dim i

	set pages = Form.GetPagesForTemplate(PageDefName)
	for i = 1 to pages.Count
		set formFields = pages.Item(i).Fields
		selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
		if not selectedCode = ReasonMisc1SD then Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode1SD(selectedCode))
		selectedCodeDet = formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).value
		Call formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).AttachList(GetReasonDetList1SD(selectedCode))
		Call formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedCodeDet))

		selectedCodeDetType = formFields.itemByName("ReasonDetTypeCode_"&Cstr(FieldIndex)).value
		Call formFields.itemByName("ReasonDetTypeCode_"&Cstr(FieldIndex)).AttachList(GetReasonDetTypeList1SD(selectedCodeDet))
		Call formFields.itemByName("ReasonDetTypeCode_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedCodeDetType))
	next
End Sub

Sub OnChangeR1SD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	if selectedCode = ReasonMisc1SD then
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue("")
	else
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode1SD(selectedCode))
	end if
	Call formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).AttachList(GetReasonDetList1SD(selectedCode))
	Call formFields.ItemByName("ReasonDetText_"&Cstr(FieldIndex)).SetCheckValue("")
	Call formFields.ItemByName("ReasonDetTypeCode_"&Cstr(FieldIndex)).SetCheckValue("")
	Call formFields.ItemByName("ReasonDetTypeText_"&Cstr(FieldIndex)).SetCheckValue("")
End Sub

Sub OnChangeRD1SD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode, selectedDetCode, selectedDetText
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	selectedDetCode = formFields.ItemByName("ReasonDetCode_"&Cstr(FieldIndex)).Value
	selectedDetText = GetReasonDetTextByCode1SD(selectedCode, selectedDetCode)
	if not (selectedDetText = "") then
		Call formFields.ItemByName("ReasonDetText_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedDetText))
	end if
	Call formFields.itemByName("ReasonDetTypeCode_"&Cstr(FieldIndex)).AttachList(GetReasonDetTypeList1SD(selectedDetCode))
	Call formFields.ItemByName("ReasonDetTypeText_"&Cstr(FieldIndex)).SetCheckValue("")
End Sub

Sub OnChangeRDT1SD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode, selectedDetCode, selectedDetText
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonDetCode_"&Cstr(FieldIndex)).Value
	selectedDetCode = formFields.ItemByName("ReasonDetTypeCode_"&Cstr(FieldIndex)).Value
	selectedDetText = GetReasonDetTypeTextByCode1SD(selectedCode, selectedDetCode)
	if not (selectedDetText = "") then
		Call formFields.ItemByName("ReasonDetTypeText_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedDetText))
	end if
End Sub

'******* 2-SD ************************************************

Function GetReasonList2SD
	dim lstLine
	dim i

	for i=0 to UBound(ReasonList2SD)
		if not lstLine = "" then lstLine = lstLine & "###"
		lstLine = lstLine & ReasonList2SD(i)(0)&";"&ReasonList2SD(i)(1)
	next

	GetReasonList2SD = split(lstLine, "###")
End Function

Function GetReasonTextByCode2SD(ReasonCode)
	dim i

	for i=0 to UBound(ReasonList2SD)
		if ReasonList2SD(i)(0) = ReasonCode then
			GetReasonTextByCode2SD = ReasonList2SD(i)(1)
			Exit Function
		end if
	next

	GetReasonTextByCode2SD = ""
End Function

Function GetReasonDetTextByCode2SD(ReasonCode, ReasonDetCode)
	dim i, j

	for i=0 to UBound(ReasonList2SD)
		if ReasonList2SD(i)(0) = ReasonCode then
			for j=0 to UBound(ReasonList2SD(i)(2))
				if ReasonList2SD(i)(2)(j)(0) = ReasonDetCode then
					GetReasonDetTextByCode2SD = ReasonList2SD(i)(2)(j)(1)
					Exit Function
				end if
			next
		end if
	next

	GetReasonDetTextByCode2SD = ""
End Function

Function GetReasonDetList2SD(ReasonCode)
	dim lstLine
	dim i, j

	for i=0 to UBound(ReasonList2SD)
		if ReasonList2SD(i)(0) = ReasonCode then
			for j=0 to UBound(ReasonList2SD(i)(2))
				if not lstLine = "" then lstLine = lstLine & "###"
				lstLine = lstLine & ReasonList2SD(i)(2)(j)(0)&";"&ReasonList2SD(i)(2)(j)(1)
			next
			GetReasonDetList2SD = split(lstLine, "###")
			Exit Function
		end if
	next

	GetReasonDetList2SD = Array("")
End Function

Function GetLawActArticleList2SD(ReasonCode, ReasonDetCode)
	dim lstLine
	dim i, j, k

	for i=0 to UBound(ReasonList2SD)
		if ReasonList2SD(i)(0) = ReasonCode then
			for j=0 to UBound(ReasonList2SD(i)(2))
				if ReasonList2Sd(i)(2)(j)(0) = ReasonDetCode then
					for k=0 to UBound(ReasonList2SD(i)(2)(j)(2))
						if not lstLine = "" then lstLine = lstLine & "###"
						lstLine = lstLine & ReasonList2Sd(i)(2)(j)(2)(k)(0)&";"&ReasonList2SD(i)(2)(j)(2)(k)(1)
					next
				end if
			next
			GetLawActArticleList2SD = split(lstLine, "###")
			Exit Function
		end if
	next

	GetLawActArticleList2SD = Array("")
End Function

Function GetLawActPartList2SD(ReasonCode, ReasonDetCode, LawActArticle)
	dim lstLine
	dim i, j, k, m

	for i=0 to UBound(ReasonList2SD)
		if ReasonList2SD(i)(0) = ReasonCode then
			for j=0 to UBound(ReasonList2SD(i)(2))
				if ReasonList2SD(i)(2)(j)(0) = ReasonDetCode then
					for k=0 to UBound(ReasonList2SD(i)(2)(j)(2))
						if ReasonList2SD(i)(2)(j)(2)(k)(0) = LawActArticle then
							for m=0 to UBound(ReasonList2SD(i)(2)(j)(2)(k)(2))
								if not lstLine = "" then lstLine = lstLine & "###"
								lstLine = lstLine & ReasonList2SD(i)(2)(j)(2)(k)(2)(m)(0)&";"&ReasonList2SD(i)(2)(j)(2)(k)(2)(m)(1)
							next
						end if
					next
				end if
			next
			GetLawActPartList2SD = split(lstLine, "###")
			Exit Function
		end if
	next

	GetLawActPartList2SD = Array("")
End Function

Function GetLawActSubsectionList2SD(ReasonCode, ReasonDetCode, LawActArticle, LawActPart)
	dim lstLine
	dim i, j, k, m, n

	for i=0 to UBound(ReasonList2SD)
		if ReasonList2SD(i)(0) = ReasonCode then
			for j=0 to UBound(ReasonList2SD(i)(2))
				if ReasonList2SD(i)(2)(j)(0) = ReasonDetCode then
					for k=0 to UBound(ReasonList2SD(i)(2)(j)(2))
						if ReasonList2SD(i)(2)(j)(2)(k)(0) = LawActArticle then
							for m=0 to UBound(ReasonList2SD(i)(2)(j)(2)(k)(2))
								if ReasonList2SD(i)(2)(j)(2)(k)(2)(m)(0) = LawActPart then
									for n=0 to UBound(ReasonList2SD(i)(2)(j)(2)(k)(2)(m)(2))
										if not lstLine = "" then lstLine = lstLine & "###"
										lstLine = lstLine & ReasonList2SD(i)(2)(j)(2)(k)(2)(m)(2)(n)(0)&";"&ReasonList2SD(i)(2)(j)(2)(k)(2)(m)(2)(n)(1)
									next
								end if
							next
						end if
					next
				end if
			next
			GetLawActSubsectionList2SD = split(lstLine, "###")
			Exit Function
		end if
	next

	GetLawActSubsectionList2SD = Array("")
End Function

Sub OnChangeROn2SD(PageDefName, FieldIndex)
	dim pages, formFields
	dim selectedCode, selectedCodeDet, selectedLawActArticle, selectedLawActPart
	dim i

	set pages = Form.GetPagesForTemplate(PageDefName)
	for i = 1 to pages.Count
		set formFields = pages.Item(i).Fields
		selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
		if not selectedCode = ReasonMisc2SD then Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode2SD(selectedCode))
		selectedCodeDet = formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).value
		Call formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).AttachList(GetReasonDetList2SD(selectedCode))
		Call formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedCodeDet))
		
		if selectedCode = "02" or selectedCode = "16" then
			selectedLawActArticle = formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).value
			Call formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).AttachList(GetLawActArticleList2SD(selectedCode, selectedCodeDet))
			Call formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedLawActArticle))
			selectedLawActPart = formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).value
			Call formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).AttachList(GetLawActPartList2SD(selectedCode, selectedCodeDet, selectedLawActArticle))
			Call formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedLawActPart))
		else
			Call formFields.ItemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue("")
			Call formFields.ItemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue("")
			Call formFields.ItemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue("")
		end if
	next
End Sub


Sub OnChangeR2SD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode, selectedDetCode, selectedLawActArticle, selectedLawActPart
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	
	if selectedCode = ReasonMisc2SD then
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue("")
	else
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode2SD(selectedCode))
	end if
	Call formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).AttachList(GetReasonDetList2SD(selectedCode))
	Call formFields.ItemByName("ReasonDetText_"&Cstr(FieldIndex)).SetCheckValue("")

	selectedDetCode = formFields.ItemByName("ReasonDetCode_"&Cstr(FieldIndex)).Value
	selectedLawActArticle = formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).value
	selectedLawActPart = formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).value
	if selectedCode = "02" or selectedCode = "16" then
		Call formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).AttachList(GetLawActArticleList2SD(selectedCode, selectedDetCode))
		Call formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).AttachList(GetLawActPartList2SD(selectedCode, selectedDetCode, selectedLawActArticle))
		Call formFields.itemByName("LawActSubsection_"&Cstr(FieldIndex)).AttachList(GetLawActSubsectionList2SD(selectedCode, selectedDetCode, selectedLawActArticle, selectedLawActPart))
	else
		Call formFields.ItemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue("")
	end if
End Sub

Sub OnChangeRD2SD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode, selectedDetCode, selectedDetText, selectedLawActArticle, selectedLawActPart
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	
	selectedDetCode = formFields.ItemByName("ReasonDetCode_"&Cstr(FieldIndex)).Value
	selectedDetText = GetReasonDetTextByCode2SD(selectedCode, selectedDetCode)
	if not (selectedDetText = "") then
		Call formFields.ItemByName("ReasonDetText_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedDetText))
	end if
	
	selectedDetCode = formFields.ItemByName("ReasonDetCode_"&Cstr(FieldIndex)).Value
	selectedLawActArticle = formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).value
	selectedLawActPart = formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).value
	if selectedCode = "02" or selectedCode = "16" then
		Call formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).AttachList(GetLawActArticleList2SD(selectedCode, selectedDetCode))
		Call formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).AttachList(GetLawActPartList2SD(selectedCode, selectedDetCode, selectedLawActArticle))
		Call formFields.itemByName("LawActSubsection_"&Cstr(FieldIndex)).AttachList(GetLawActSubsectionList2SD(selectedCode, selectedDetCode, selectedLawActArticle, selectedLawActPart))
	else
		Call formFields.ItemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue("")
	end if
End Sub

Sub OnChangeA2SD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode, selectedDetCode, selectedDetText, selectedLawActArticle, selectedLawActPart
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	
	selectedDetCode = formFields.ItemByName("ReasonDetCode_"&Cstr(FieldIndex)).Value
	selectedLawActArticle = formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).value
	selectedLawActPart = formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).value
	if selectedCode = "02" or selectedCode = "16" then
		Call formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedLawActArticle))
		Call formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).AttachList(GetLawActPartList2SD(selectedCode, selectedDetCode, selectedLawActArticle))
		Call formFields.itemByName("LawActSubsection_"&Cstr(FieldIndex)).AttachList(GetLawActSubsectionList2SD(selectedCode, selectedDetCode, selectedLawActArticle, selectedLawActPart))
	else
		Call formFields.ItemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue("")
	end if
End Sub

Sub OnChangeP2SD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode, selectedDetCode, selectedDetText, selectedLawActArticle, selectedLawActPart, selectedLawActSubsection
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	
	selectedDetCode = formFields.ItemByName("ReasonDetCode_"&Cstr(FieldIndex)).Value
	selectedLawActArticle = formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).value
	selectedLawActPart = formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).value
	if selectedCode = "02" or selectedCode = "16" then
		Call formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedLawActPart))
		Call formFields.itemByName("LawActSubsection_"&Cstr(FieldIndex)).AttachList(GetLawActSubsectionList2SD(selectedCode, selectedDetCode, selectedLawActArticle, selectedLawActPart))	
	else
		Call formFields.ItemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue("")
	end if
End Sub

Sub OnChangeS2SD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode, selectedDetCode, selectedDetText, selectedLawActArticle, selectedLawActPart, selectedLawActSubsection
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	
	selectedDetCode = formFields.ItemByName("ReasonDetCode_"&Cstr(FieldIndex)).Value
	selectedLawActArticle = formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).value
	selectedLawActPart = formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).value
	selectedLawActSubsection = formFields.itemByName("LawActSubsection_"&Cstr(FieldIndex)).value
	if selectedCode = "02" or selectedCode = "16" then
		Call formFields.itemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedLawActSubsection))
	else
		Call formFields.ItemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue("")
	end if	
End Sub

'************** 9-SD ***************************************

Sub OnChangeR9SD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode9SD(selectedCode))
End Sub

Sub OnChangeROn9SD(PageDefName, FieldIndex)
	dim pages, formFields
	dim selectedCode
	dim i

	set pages = Form.GetPagesForTemplate(PageDefName)
	for i = 1 to pages.Count
		set formFields = pages.Item(i).Fields
		selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode9SD(selectedCode))
	next
End Sub

Function GetReasonList9SD
	dim lstLine
	dim i

	for i=0 to UBound(ReasonList9SD)
		if not lstLine = "" then lstLine = lstLine & "###"
		lstLine = lstLine & ReasonList9SD(i)(0)&";"&ReasonList9SD(i)(1)
	next

	GetReasonList9SD = split(lstLine, "###")
End Function

Function GetReasonTextByCode9SD(ReasonCode)
	dim i

	for i=0 to UBound(ReasonList9SD)
		if ReasonList9SD(i)(0) = ReasonCode then
			GetReasonTextByCode9SD = ReasonList9SD(i)(1)
			Exit Function
		end if
	next

	GetReasonTextByCode9SD = ""
End Function

'************** 12-SD ***************************************

Sub OnChangeR12SD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	if selectedCode = ReasonMisc12SD then
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue("")
	else
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode12SD(selectedCode))
	end if
End Sub

Sub OnChangeROn12SD(PageDefName, FieldIndex)
	dim pages, formFields
	dim selectedCode
	dim i

	set pages = Form.GetPagesForTemplate(PageDefName)
	for i = 1 to pages.Count
		set formFields = pages.Item(i).Fields
		selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
		if not selectedCode = ReasonMisc12SD then Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode12SD(selectedCode))
	next
End Sub

Function GetReasonList12SD
	dim lstLine
	dim i

	for i=0 to UBound(ReasonList12SD)
		if not lstLine = "" then lstLine = lstLine & "###"
		lstLine = lstLine & ReasonList12SD(i)(0)&";"&ReasonList12SD(i)(1)
	next

	GetReasonList12SD = split(lstLine, "###")
End Function

Function GetReasonTextByCode12SD(ReasonCode)
	dim i

	for i=0 to UBound(ReasonList12SD)
		if ReasonList12SD(i)(0) = ReasonCode then
			GetReasonTextByCode12SD = ReasonList12SD(i)(1)
			Exit Function
		end if
	next

	GetReasonTextByCode12SD = ""
End Function

'************** 13-SD ***************************************

Sub OnChangeR13SD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	if selectedCode = ReasonMisc13SD then
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue("")
	else
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode13SD(selectedCode))
	end if
End Sub

Sub OnChangeROn13SD(PageDefName, FieldIndex)
	dim pages, formFields
	dim selectedCode
	dim i

	set pages = Form.GetPagesForTemplate(PageDefName)
	for i = 1 to pages.Count
		set formFields = pages.Item(i).Fields
		selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
		if not selectedCode = ReasonMisc13SD then Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode13SD(selectedCode))
	next
End Sub

Function GetReasonList13SD
	dim lstLine
	dim i

	for i=0 to UBound(ReasonList13SD)
		if not lstLine = "" then lstLine = lstLine & "###"
		lstLine = lstLine & ReasonList13SD(i)(0)&";"&ReasonList13SD(i)(1)
	next

	GetReasonList13SD = split(lstLine, "###")
End Function

Function GetReasonTextByCode13SD(ReasonCode)
	dim i

	for i=0 to UBound(ReasonList13SD)
		if ReasonList13SD(i)(0) = ReasonCode then
			GetReasonTextByCode13SD = ReasonList13SD(i)(1)
			Exit Function
		end if
	next

	GetReasonTextByCode13SD = ""
End Function

'************* SAM3SDP **************************************

Sub OnChangeRSAM3SDP(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	if selectedCode = ReasonMiscSAM3SDP then
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue("")
	else
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCodeSAM3SDP(selectedCode))
	end if
End Sub

Sub OnChangeROnSAM3SDP(PageDefName, FieldIndex)
	dim pages, formFields
	dim selectedCode
	dim i

	set pages = Form.GetPagesForTemplate(PageDefName)
	for i = 1 to pages.Count
		set formFields = pages.Item(i).Fields
		selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
		if not selectedCode = ReasonMiscSAM3SDP then Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCodeSAM3SDP(selectedCode))
	next
End Sub

Function GetReasonTextByCodeSAM3SDP(ReasonCode)
	dim i

	for i=0 to UBound(ReasonListSAM3SDP)
		if ReasonListSAM3SDP(i)(0) = ReasonCode then
			GetReasonTextByCodeSAM3SDP = ReasonListSAM3SDP(i)(1)
			Exit Function
		end if
	next

	GetReasonTextByCodeSAM3SDP = ""
End Function

'************* NP-SD **************************************

Sub OnChangeRNPSD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	if selectedCode = ReasonMiscNPSD then
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue("")
	else
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCodeNPSD(selectedCode))
	end if
End Sub

Sub OnChangeRNPSD2(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	if selectedCode = ReasonMiscNPSD2 then
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue("")
	else
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCodeNPSD2(selectedCode))
	end if
End Sub

Sub OnChangeROnNPSD(PageDefName, FieldIndex)
	dim pages, formFields
	dim selectedCode
	dim i

	set pages = Form.GetPagesForTemplate(PageDefName)
	for i = 1 to pages.Count
		set formFields = pages.Item(i).Fields
		selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
		if not selectedCode = ReasonMiscNPSD then Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCodeNPSD(selectedCode))
	next
End Sub

Sub OnChangeROnNPSD2(PageDefName, FieldIndex)
	dim pages, formFields
	dim selectedCode
	dim i

	set pages = Form.GetPagesForTemplate(PageDefName)
	for i = 1 to pages.Count
		set formFields = pages.Item(i).Fields
		selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
		if not selectedCode = ReasonMiscNPSD2 then Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCodeNPSD2(selectedCode))
	next
End Sub

Function GetReasonTextByCodeNPSD(ReasonCode)
	dim i

	for i=0 to UBound(ReasonListNPSD)
		if ReasonListNPSD(i)(0) = ReasonCode then
			GetReasonTextByCodeNPSD = ReasonListNPSD(i)(1)
			Exit Function
		end if
	next

	GetReasonTextByCodeNPSD = ""
End Function

Function GetReasonTextByCodeNPSD2(ReasonCode)
	dim i

	for i=0 to UBound(ReasonListNPSD2)
		if ReasonListNPSD2(i)(0) = ReasonCode then
			GetReasonTextByCodeNPSD2 = ReasonListNPSD2(i)(1)
			Exit Function
		end if
	next

	GetReasonTextByCodeNPSD2 = ""
End Function

'************************************************************

Sub SetPageNumbers(PageDefs)
	dim pageDef, pages, defCount
	dim totalCount, currentShift
	dim i, j

	totalCount = 0
	For i = 0 to 10
		Set pages = Form.GetPagesForTemplate(FormDefs(i))
		For j = 1 To pages.Count
			totalCount = totalCount + 1
			pages.Item(j).Fields.ItemByName("PageNumber").SetCheckValue Cstr(totalCount)
			Call SetFormCodeVers(FormDefs(i), j, FormVersion)
		Next
	Next
	For i = 0 to 10
		Set pages = Form.GetPagesForTemplate(FormDefs(i))
		For j = 1 To pages.Count
			pages.Item(j).Fields.ItemByName("PageTotal").SetCheckValue Cstr(totalCount)
		Next
	Next
End Sub

Function GetPageCount(PageDefs)
	dim pageDef
	dim totalCount

	totalCount = 0
	for each pageDef in PageDefs
		totalCount = totalCount + ACount(pageDef)
	next
	GetPageCount = totalCount
End Function

Sub CopyFieldsFromParent(ParentPageDef, ChildPageDef, FormFields)
	dim parentPage, childPages, field
	dim i

	Set parentPage = Form.GetPagesForTemplate(ParentPageDef).item(1)
	Set childPages = Form.GetPagesForTemplate(ChildPageDef)
	For i = 1 To childPages.Count
		for each field in FormFields
			childPages.Item(i).Fields.ItemByName(field).SetCheckValue parentPage.Fields.ItemByName(field).Value
		Next
	Next
End Sub

Function CompleteFieldset(FormFields, Fields, RaiseError)
	dim i

	CompleteFieldset = True
	for i=0 to ubound(Fields)
		if FormFields.ItemByName(Fields(i)).value = "" then
			CompleteFieldset = False
			if RaiseError then 
				Call form.setError("Laukas turi būti užpildytas.", array(FormFields.itembyname(Fields(i))), EL_ERROR)
			else
				Exit Function
			end if
		end if
	next
End Function

Function CompleteFieldsetAny(FormFields, Fields)
	dim i

	CompleteFieldsetAny = False
	for i=0 to ubound(Fields)
		if not FormFields.ItemByName(Fields(i)).value = "" then
			CompleteFieldsetAny = True
			Exit Function
		end if
	next
End Function

Function validateJuridicalCode(Item)
	Dim value
	value = Item.value
	if not (len(value)=7 or len(value)=9) then 
		form.setError "Juridinio asmens kodo ilgis turi būti 7 arba 9 skaitmenys", array(Item), EL_ERROR
	end if
End Function

Function validateInsurerCode(Item)
	Dim value
	
	validateInsurerCode = False
	value = Item.value
	if len(value)<5 then 
		form.setError "Nurodytas per trumpas draudėjo kodas", array(Item), EL_ERROR
		Exit Function
	end if
	validateInsurerCode = True
End Function

Function validateInsurerPhone(Item)
	Dim value, i
	
	validateInsurerPhone = False
	value = Item.value
	for i = 1 to len(value)
		Select Case Mid(value, i, 1)
			Case "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "-", "(", ")", " "
			Case else
				form.setError "6 laukelyje yra neleistinų simbolių. Telefono numerio lauke galima įvesti tik skaitmenis 0-9, simbolius (, ), -, + ir tarpą", array(Item), EL_ERROR
				Exit Function
		End Select
	next	
	validateInsurerPhone = True
End Function

Function validatePersonCode(AK)
	dim i, j, suma, suma1, stabdis, GimD, laukasX, indeksas, bool, bool2
	Dim objRE, Match, Matches, log
	
	'validatePersonCode = false
	validatePersonCode = true ' apie neteisingą a/k tik informuojama (warning), nebent <11 simboliu
	Set objRE = New RegExp 
	objRE.Global = True
	objRE.IgnoreCase = True

	laukasX = AK.value
	
	if len(laukasX)<11 then 
		form.setError "Asmens kodo ilgis turi būti 11 skaitmenų", array(AK), EL_ERROR
		validatePersonCode = false
		Exit Function
	end if
	stabdis = 0
	If Left(laukasX, 1) <> "1" and Left(laukasX, 1) <> "2" and Left(laukasX, 1) <> "3" and Left(laukasX, 1) <> "4" and Left(laukasX, 1) <> "5" and Left(laukasX, 1) <> "6" Then
		stabdis = 1
		'Form.SetError "Asmens kodo pirmasis simbolis turi būti skaičius 1, 2, 3, 4, 5 arba 6", Array(AK), EL_WARNING
		Form.SetError "Nurodytas netikslus asmens kodas", Array(AK), EL_WARNING
		Exit Function
	End If
	Select case Left(laukasX, 1)
		case "1", "2"
			GimD = "18" & Mid(laukasX, 2, 2) & "-" & Mid(laukasX, 4, 2) & "-" & Mid(laukasX, 6, 2)
		case "3", "4"
			GimD = "19" & Mid(laukasX, 2, 2) & "-" & Mid(laukasX, 4, 2) & "-" & Mid(laukasX, 6, 2)
		case "5", "6"
			GimD = "20" & Mid(laukasX, 2, 2) & "-" & Mid(laukasX, 4, 2) & "-" & Mid(laukasX, 6, 2)
	End Select
	If stabdis = 0 Then
		If Not IsDate(GimD) Then
			stabdis = 1
			'Form.SetError "Asmens kode neteisingai nurodyta gimimo data ("& cstr(GimD) &")", Array(AK), EL_WARNING
			Form.SetError "Nurodytas netikslus asmens kodas", Array(AK), EL_WARNING
			Exit Function
		End If
	End If
	suma = 0
	For i = 1 To 9
		suma = suma + (CLng(Mid(laukasX, i, 1)) ) * i
	Next
	suma = suma + CLng(Mid(laukasX, 10, 1))
	suma = suma Mod 11
		
	If suma >= 10 Then
		suma = 0
		For i = 3 to 9
			suma = suma + (CLng(Mid(laukasX, i-2, 1)) ) * i
		Next
		For i = 1 to 3
			suma = suma + (CLng(Mid(laukasX, i+7, 1)) ) * i
		Next
		suma = suma Mod 11
	End If
	If suma = 10 Then suma = 0
	If stabdis = 0 Then
		If suma <> CLng(Mid(laukasX, 11, 1)) Then 
			stabdis = 1
			'Form.SetError "Asmens kode neteisingas kontrolinis skaitmuo", Array(AK), EL_WARNING
			Form.SetError "Nurodytas netikslus asmens kodas", Array(AK), EL_WARNING
			Exit Function
		End If
	End If
		
	validatePersonCode = true
end function

Sub SetFormCodeVers(PageDef, PageIndex, FormVersion)
	dim pages
	dim i

	Set pages = Form.GetPagesForTemplate(PageDef)
	if PageIndex = 0 then
		For i = 1 To pages.Count
			pages.Item(i).Fields.ItemByName("FormCode").SetCheckValue Cstr(PageDef)
			pages.Item(i).Fields.ItemByName("FormVersion").SetCheckValue Cstr(FormVersion)
		Next
	else
		pages.Item(PageIndex).Fields.ItemByName("FormCode").SetCheckValue Cstr(PageDef)
		pages.Item(PageIndex).Fields.ItemByName("FormVersion").SetCheckValue Cstr(FormVersion)
	end if
End sub

Sub SetCurrency(formFields, RowNum, FieldName, DateType, FormType)
	Dim fields, p, pages
	If DateType = "D" then
		If formFields.ItemByName(FieldName&RowNum).value <> "" then
			If DateValue(formFields.ItemByName(FieldName&RowNum).ToDate) >= DateValue("2015-01-01") Then
	     			formFields.ItemByName("Currency_"&RowNum).SetCheckValue("EUR")
			End If
	
			If DateValue(formFields.ItemByName(FieldName&RowNum).ToDate) < DateValue("2015-01-01") Then
				formFields.ItemByName("Currency_"&RowNum).SetCheckValue("LT")
			End If	
		End If
		If formFields.ItemByName(FieldName&RowNum).value = "" then
			formFields.ItemByName("Currency_"&RowNum).SetCheckValue("")
		end if
	End If
	If DateType = "Y" then
		set pages = form.getpagesfortemplate(FormType)
		for p = 1 to pages.count
			set fields = pages.item(p).fields
			If fields.ItemByName(FieldName).value <> "" then
				If fields.ItemByName(FieldName).value >= 2015 Then
	     				fields.ItemByName("Currency_"&RowNum).SetCheckValue("EUR")
				End If
	
				If fields.ItemByName(FieldName).value < 2015 Then
					fields.ItemByName("Currency_"&RowNum).SetCheckValue("LT")
				End If	
			End If
			If fields.ItemByName(FieldName).value = "" then
				fields.ItemByName("Currency_"&RowNum).SetCheckValue("")
			End if
		next
	End If	
End sub

Function ValidateTaxes(Fields, PageNum, RowNum)
	dim taxRate

	ValidateTaxes = False
	if Fields.itemByName("TaxRate_"&RowNum).value = "" then
		form.setError "Turi būti nurodytas bendras įmokų tarifas "&PageNum&" lapo "&RowNum&" eilutėje", array(Fields.itemByName("TaxRate_"&RowNum)), EL_ERROR
		Exit Function
	end if
	
	taxRate = Fields.itemByName("TaxRate_"&RowNum).toDecimal
	
	
	if Fields.ItemByName("RevisedCycleYear").value >= 2019 and (Fields.ItemByName("FormCode").value = "PT-2-SD" or Fields.ItemByName("FormCode").value = "PT-13-SD" or Fields.ItemByName("FormCode").value = "PT-SAM3SD" or Fields.ItemByName("FormCode").value = "PT-SAM3SDP" or Fields.ItemByName("FormCode").value = "PT-SAM3SD-M") then
		if (taxRate < 0.00 or taxRate > 99.99) then
			form.setError "Tarifas turi būti skaičius nuo 0,00 iki 99,99 "&PageNum&" lapo "&RowNum&" eilutėje", array(Fields.itemByName("TaxRate_"&RowNum)), EL_ERROR
			Exit Function
		end if
	else
		if (taxRate < 0.01 or taxRate > 99.99) then
			form.setError "Tarifas turi būti skaičius nuo 0,01 iki 99,99 "&PageNum&" lapo "&RowNum&" eilutėje", array(Fields.itemByName("TaxRate_"&RowNum)), EL_ERROR
			Exit Function
		end if
	end if
	


	ValidateTaxes = True
End Function

'----------------------------------------------------------------------
' Description: Standard functions for processing form fields
' Copyright (c) ABBYY Software House, 2003. All rights reserved.
'----------------------------------------------------------------------

' Sums the values of the fieldName field on all pageDefName pages
Function ASum( pageDefName, fieldName )
	Dim sum, pages, i, fieldValue
	sum = 0
	Set pages = Form.GetPagesForTemplate( pageDefName )
	For i = 1 To pages.Count
		sum = sum + pages.Item( i ).Fields.ItemByName( fieldName ).ToDecimal
	Next
	ASum = sum
End Function

' Sums the product of the fieldName1 and fieldName2 fields on all pageDefName pages
Function ASumProduct( pageDefName, fieldName1, fieldName2 )
	Dim sum, pages, fields, i
	sum = 0
	Set pages = Form.GetPagesForTemplate( pageDefName )
	For i = 1 To pages.Count
		Set fields = pages.Item( i ).Fields
		sum = sum + fields.ItemByName( fieldName1 ).ToDecimal * fields.ItemByName( fieldName2 ).ToDecimal
	Next
	ASumProduct = sum
End Function

' Returns the number of the pageDefName page copies in the form document
Function ACount( pageDefName )
	ACount = Form.GetPagesForTemplate( pageDefName ).Count
End Function

' Returns the number of the filled (not empty) fieldName fields on all copies 
' of the pageDefName pages in the form document
Function ACountNotEmpty( pageDefName, fieldName )
	Dim count, pages, i
	count = 0
	Set pages = Form.GetPagesForTemplate( pageDefName )
	For i = 1 To pages.Count
		If pages.Item( i ).Fields.ItemByName( fieldName ).Value <> "" Then
			count = count + 1
		End If
	Next
	ACountNotEmpty = count
End Function

' Returns the minimum numeric value for the fieldName fields on all the pageDefName page copies
Function AMinNum( pageDefName, fieldName )
	Dim firstOccurence, pages, i, fieldValue, minValue
	firstOccurence = True
	Set pages = Form.GetPagesForTemplate( pageDefName )
	For i = 1 To pages.Count
		fieldValue = pages.Item( i ).Fields.ItemByName( fieldName ).ToDecimal
		If IsNumeric( fieldValue ) Then
			If firstOccurence Or fieldValue < minValue Then
				minValue = fieldValue
				firstOccurence = False
			End If
		End If
	Next
	AMinNum = minValue
End Function

' Returns the maximum numeric value for the fieldName fields on all the pageDefName page copies
Function AMaxNum( pageDefName, fieldName )
	Dim firstOccurence, pages, i, fieldValue, maxValue
	firstOccurence = True
	Set pages = Form.GetPagesForTemplate( pageDefName )
	For i = 1 To pages.Count
		fieldValue = pages.Item( i ).Fields.ItemByName( fieldName ).ToDecimal
		If IsNumeric( fieldValue ) Then
			If firstOccurence Or fieldValue > maxValue Then
				maxValue = fieldValue
				firstOccurence = False
			End If
		End If
	Next
	AMaxNum = maxValue
End Function

' Returns the minimum date value for the fieldName fields on all the pageDefName page copies
Function AMinDate( pageDefName, fieldName )
	Dim firstOccurence, pages, i, fieldValue, minValue
	firstOccurence = True
	Set pages = Form.GetPagesForTemplate( pageDefName )
	For i = 1 To pages.Count
		fieldValue = pages.Item( i ).Fields.ItemByName( fieldName ).ToDate
		If IsDate( fieldValue ) Then
			If firstOccurence Or fieldValue < minValue Then
				minValue = fieldValue
				firstOccurence = False
			End If
		End If
	Next
	AMinDate = minValue
End Function

' Returns the minimum text (string) value for the fieldName fields on all the pageDefName page copies
Function AMinText( pageDefName, fieldName )
	Dim firstOccurence, pages, i, fieldValue, minValue
	firstOccurence = True
	Set pages = Form.GetPagesForTemplate( pageDefName )
	For i = 1 To pages.Count
		fieldValue = pages.Item( i ).Fields.ItemByName( fieldName ).Value
		If firstOccurence Or fieldValue < minValue Then
			minValue = fieldValue
			firstOccurence = False
		End If
	Next
	AMinText = minValue
End Function

' Returns the minimum text (string) value for the fieldName fields on all the pageDefName page copies
Function AMinText( pageDefName, fieldName )
	Dim firstOccurence, pages, i, fieldValue, minValue
	firstOccurence = True
	Set pages = Form.GetPagesForTemplate( pageDefName )
	For i = 1 To pages.Count
		fieldValue = pages.Item( i ).Fields.ItemByName( fieldName ).Value
		If firstOccurence Or fieldValue < minValue Then
			minValue = fieldValue
			firstOccurence = False
		End If
	Next
	AMinText = minValue
End Function

' Returns the maximum text (string) value for the fieldName fields on all the pageDefName page copies
Function AMaxText( pageDefName, fieldName )
	Dim firstOccurence, pages, i, fieldValue, maxValue
	firstOccurence = True
	Set pages = Form.GetPagesForTemplate( pageDefName )
	For i = 1 To pages.Count
		fieldValue = pages.Item( i ).Fields.ItemByName( fieldName ).Value
		If firstOccurence Or fieldValue > maxValue Then
			maxValue = fieldValue
			firstOccurence = False
		End If
	Next
	AMaxText = maxValue
End Function

' Returns the field value on the first page of the specified type in the document
Function AFirst( pageDefName, fieldName )
	Dim pages
	Set pages = Form.GetPagesForTemplate( pageDefName )
	If pages.Count > 0 Then
		AFirst = pages.Item( 1 ).Fields.ItemByName( fieldName ).Value
	End If
End Function

' Returns the field value on the last page of the specified type in the document
Function ALast( pageDefName, fieldName )
	Dim pages
	Set pages = Form.GetPagesForTemplate( pageDefName )
	If pages.Count > 0 Then
		ALast = pages.Item( pages.Count ).Fields.ItemByName( fieldName ).Value
	End If
End Function

Sub SafeCall(subroutineName)
    On Error Resume Next
    Execute ("call " & subroutineName)
    If Err.Number <> 0 Then
        Form.SetError "Internal VBScript error in "&subroutineName &":#" & CStr(Err.Number) & " " & Err.Description, , EL_CriticalError
    End If
End sub
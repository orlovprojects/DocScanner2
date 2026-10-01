Option Explicit

dim ReasonList
dim ReasonMisc
dim FormDefs
dim FormVersion
dim RowCountFirst
dim RowCountSupl
dim RowFieldsAll
dim RowFieldsReq
dim RowFieldsReq_2
dim HeaderFieldsReq
dim FooterFieldsReq

Call InitValues

' This function starts execution of the script
Sub Main()
	dim formFields
	dim criticalError
	
	Call ResetReasonOnMain
	criticalError = false
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	Call SetPageNumbers(FormDefs)
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(1), Array("InsurerCode","DocDate","DocNumber"))
	Call ValidateHeader(formFields)
	Call ValidateFooter(formFields)
	Call RecalcBody
End Sub

Sub onAppend()
	'Add your code here
End Sub

Sub onInit()
	form.getpagesForTemplate(FormDefs(0)).Item(1).fields.itembyname("DocDate").setCheckValue "" & Form.FormatDate(date)
	Call SetFormCodeVers(FormDefs(0), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(1), 0, FormVersion)
	Call SetPageNumbers(FormDefs)
	Call SetOnChangedHandlers
End Sub

Sub onAddPage(PageName, PageIndex)
	Call SetPageNumbers(FormDefs)
	Call SetFormCodeVers(PageName, PageIndex, FormVersion)
End Sub

Sub InitValues()
	Form.SetDefaultDecimalSeparator ","
	Form.SetDefaultDateFormat DF_YearMonthDay, YL_FourDigits, "-"
'-- ReasonList classificator values ------------------------------------
	ReasonList = Array(_
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
	ReasonMisc = "99"

	'-- Other form variables --
	FormDefs = Array("12-SD","12-SD-T")
	FormVersion = "05"

	RowCountFirst = 2
	RowCountSupl = 4
	
	HeaderFieldsReq = Array("InsurerName", "InsurerAddress")
	FooterFieldsReq = Array("ManagerFullName", "PreparatorDetails")
	RowFieldsAll = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_","InsuranceSuspendStart_","InsuranceSuspendEnd_","PersonFirstName_","PersonLastName_","ReasonCode_","ReasonText_")
	RowFieldsReq = Array("InsuranceSuspendStart_","InsuranceSuspendEnd_","PersonFirstName_","PersonLastName_","ReasonCode_")
	RowFieldsReq_2 = Array("InsuranceSeries_", "InsuranceNumber_", "PersonCode_")
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
End Sub

Sub ValidateFooter(Fields)
	If not CompleteFieldSet(Fields, GetFieldNames(FooterFieldsReq, 0), False) then
		form.setError "Turi būti įvesti vadovo ir rengėjo duomenys", GetFieldObjects(Fields, FooterFieldsReq, 0), EL_ERROR
	end if
End sub

Sub RecalcBody
	dim formFields, formFields2
	dim pageCount, rowCount
	dim i, j, p, i2, j2, c4, i4
	dim tusciaEilute, tusciaEilute1
	
	'FormVersion ir FormCode uzdejimas paspaudus TIKRINTI
	Call SetFormCodeVers(FormDefs(0), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(1), 0, FormVersion)

	rowCount = 0
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	
	'first page calculation
	for i = 1 to RowCountFirst
		if CompleteFieldsetAny(formFields, GetFieldNames(RowFieldsAll, i)) then
			rowCount = rowCount + 1
			
'DT19-(08)014 - iesko per 12-SD puslapius tusciu eiluciu -------------------				
				if tusciaEilute1 then
					form.setError "12-SD pagrindiniame lape neužpildyta eilutė.", GetFieldObjects(formFields, Array("RowNumber_"&Cstr(i2)), 0), EL_ERROR
					tusciaEilute1 = false
				end if
			
			Call formFields.ItemByName("RowNumber_"&i).SetCheckValue(Cstr(rowCount))
			if ValidateRow(formFields, 1, i) then
				' Row processing
			end if
		else
			Call formFields.ItemByName("RowNumber_"&i).SetCheckValue("")
			
'DT19-(08)014 -------------------------------------------------------------
				tusciaEilute1 = true 'DT19-(08)014
				i2 = i
				c4 = c4 + 1
			
		end if
	next
	
	'supplementary page calculation
	pageCount = ACount(FormDefs(1))
	for j = 1 to pageCount
		set formFields = form.getpagesForTemplate(FormDefs(1)).Item(j).fields
		p = 0
		for i = 1 to RowCountSupl
			if CompleteFieldsetAny(formFields, GetFieldNames(RowFieldsAll, i)) then
				rowCount = rowCount + 1
				p = p + 1
				
'DT19-(08)014 - iesko per 12-SD-T puslapius tusciu eiluciu -------------------
				if tusciaEilute1 then 
					set formFields2 = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
					for i4 = 1 to c4
						form.setError "12-SD pagrindiniame lape neužpildyta eilutė.", GetFieldObjects(formFields2, Array("RowNumber_"&Cstr(i2-c4+i4)), 0), EL_ERROR
					next
					tusciaEilute1 = false
				end if			
				
				formFields.ItemByName("RowNumber_"&i).SetCheckValue Cstr(rowCount)
				if ValidateRow(formFields, j+1, i) then
					' Row processing
				end if
			else
				Call formFields.ItemByName("RowNumber_"&i).SetCheckValue("")
			end if
		next
		if p = 0 then
			form.setError "Neužpildytas "&Cstr(j+1)&" lapas. Jei jis nereikalingas, pašalinkite jį.", GetFieldObjects(formFields, Array("FormCode"), 0), EL_ERROR
		end if
	next
	Call PazymetiTuscius(FormDefs(1), "12-SD-T", pageCount, RowCountSupl, RowFieldsAll)
	
	'totals
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	Call formFields.ItemByName("PersonCountTotal").SetCheckValue(Cstr(rowCount))
	if rowCount = 0 then 
		form.setError "Neįvesti nei vieno apdraustojo duomenys", GetFieldObjects(FormFields, RowFieldsReq, 1), EL_ERROR
		Exit sub
	end if
End Sub

Function PazymetiTuscius (FD, S1, PCount, RCS, RFA)
	dim i, j, i2, j2, j3, i3, c1, c2, c3
	dim formFields, formFields2
	dim tuscias
	
	c2 = 0
	i2 = 0
	j2 = 0
	tuscias = false
	for j = 1 to PCount
		if tuscias then
			set formFields2 = form.getpagesForTemplate(FD).Item(j2).fields
			for j3 = 1 to c2
				form.setError "Neužpildyta eilutė "&S1&" priedo "&Cstr(j2)&" lape", GetFieldObjects(formFields2, Array("RowNumber_"&Cstr(i2-c2+j3)), 0), EL_ERROR
			next
			tuscias = false
			c2 = 0
		end if
		c2 = 0
		set formFields = form.getpagesForTemplate(FD).Item(j).fields
		for i = 1 to RCS
			if CompleteFieldsetAny(formFields, GetFieldNames(RFA, i)) then
				'c1 = c1 + 1
				if tuscias then
					set formFields2 = form.getpagesForTemplate(FD).Item(j2).fields
					for j3 = 1 to c2
						form.setError "Neužpildyta eilutė "&S1&" priedo "&Cstr(j2)&" lape", GetFieldObjects(formFields2, Array("RowNumber_"&Cstr(i2-c2+j3)), 0), EL_ERROR
					next
					tuscias = false
					c2 = 0
				end if
			else
				c2 = c2 + 1
				tuscias = true
				i2 = i
				j2 = j
			end if
		next
	next

End Function

Function ValidateRow(FormFields, PageNum, RowNum)
	ValidateRow = false
	dim rsnCode
	If Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReq, RowNum), False) then
		form.setError "Neįvesti būtini apdraustojo duomenys "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq, RowNum), EL_ERROR
		Exit Function
	end if
	
        'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_"&RowNum).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value = "" and FormFields.ItemByName("PersonCode_"&RowNum).value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq_2, RowNum), EL_ERROR
	end if

	if Not (FormFields.ItemByName("PersonCode_"&RowNum).value = "") then
		If not validatePersonCode(FormFields.ItemByName("PersonCode_"&RowNum)) Then Exit Function
	end if
	
	rsnCode = FormFields.ItemByName("ReasonCode_"&RowNum).value
	if not ValidateReason(FormFields, PageNum, RowNum, rsnCode) then Exit Function
	
	'if CDate(FormFields.ItemByName("InsuranceSuspendEnd_"&RowNum).value) < CDate(FormFields.ItemByName("InsuranceSuspendStart_"&RowNum).value) then
	if DateDiff("d", FormFields.ItemByName("InsuranceSuspendStart_"&RowNum).toDate, FormFields.ItemByName("InsuranceSuspendEnd_"&RowNum).toDate) < 0 then
		form.setError "Nedraudiminio laikotarpio pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("InsuranceSuspendStart_","InsuranceSuspendEnd_"), RowNum), EL_ERROR
	end if
	
	if rsnCode = "09" AND (DateDiff("d", FormFields.ItemByName("InsuranceSuspendStart_"&RowNum).toDate, FormFields.ItemByName("DocDate").toDate) < 0 OR DateDiff("d", FormFields.ItemByName("InsuranceSuspendEnd_"&RowNum).toDate, FormFields.ItemByName("DocDate").toDate) < 0) then
		form.setError "Informacija apie pravaikštas teikiama pasibaigus pravaikštos laikotarpiui arba ne anksčiau kaip paskutinę mėnesio dieną", GetFieldObjects(FormFields, Array("InsuranceSuspendStart_","InsuranceSuspendEnd_"), RowNum), EL_ERROR
	end if
	
	ValidateRow = true
End function

Function ValidateReason(FormFields, PageNum, RowNum, RsnCode)
	dim rsnText
	dim rsnTextExist
	
	ValidateReason = false
	
	rsnText = ucase(GetReasonTextByCode(RsnCode))
	rsnTextExist = ucase(FormFields.ItemByName("ReasonText_"&RowNum).value)
	if not (rsnTextExist = rsnText) then
		if not (RsnCode = ReasonMisc) then
			FormFields.ItemByName("ReasonText_"&RowNum).SetCheckValue(rsnText)
			rsnTextExist = rsnText
		end if
	end if
	
	if trim(rsnTextExist) = "" then
		form.setError "Nenurodytas pranešimo pateikimo priežasties atvejis "&PageNum&" lapo "&RowNum&" eilutėje", Array(FormFields.ItemByName("ReasonText_"&RowNum)), EL_ERROR
		exit function
	end if
		
	ValidateReason = true
End FUnction

'== Common ESD functions ======================================================

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
	dim i

	for i = 1 to RowCountFirst
		Call form.SetOnChangedHandlerEx("OnChangeR", Cstr(FormDefs(0)), "ReasonCode_"&Cstr(i))
	next

	for i = 1 to RowCountSupl
		Call form.SetOnChangedHandlerEx("OnChangeR", Cstr(FormDefs(1)), "ReasonCode_"&Cstr(i))
	next
End sub

Sub OnChangeR(PageName, PageIndex, FieldName)
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
		Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode(selectedCode))
	end if
End Sub

Sub ResetReasonOnMainOld
	dim i, j, cn
	
	for i = 1 to RowCountFirst
		Call OnChangeR(FormDefs(0), 1, "ReasonCode_"&Cstr(i))
	next
	
	cn = Form.GetPagesForTemplate(FormDefs(1)).Count
	for j = 1 to cn
		for i = 1 to RowCountSupl
			Call OnChangeR(FormDefs(1), j, "ReasonCode_"&Cstr(i))
		next
	next
End Sub
Sub ResetReasonOnMain
	dim i
	
	for i = 1 to RowCountFirst
		Call OnChangeROnMain(FormDefs(0), i)
	next
	
	for i = 1 to RowCountSupl
		Call OnChangeROnMain(FormDefs(1), i)
	next
End Sub

Sub OnChangeROnMain(PageDefName, FieldIndex)
	dim pages, formFields
	dim selectedCode
	dim i

	set pages = Form.GetPagesForTemplate(PageDefName)
	for i = 1 to pages.Count
		set formFields = pages.Item(i).Fields
		selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
		if not selectedCode = ReasonMisc then Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode(selectedCode))
	next
End Sub

Function GetReasonList
	dim lstLine
	dim i

	for i=0 to UBound(ReasonList)
		if not lstLine = "" then lstLine = lstLine & "###"
		lstLine = lstLine & ReasonList(i)(0)&";"&ReasonList(i)(1)
	next

	GetReasonList = split(lstLine, "###")
End Function

Function GetReasonTextByCode(ReasonCode)
	dim i

	for i=0 to UBound(ReasonList)
		if ReasonList(i)(0) = ReasonCode then
			GetReasonTextByCode = ReasonList(i)(1)
			Exit Function
		end if
	next

	GetReasonTextByCode = ""
End Function

Sub SetPageNumbers(PageDefs)
	dim pageDef, pages
	dim totalCount, currentShift
	dim i

	totalCount = GetPageCount(PageDefs)
	currentShift = 0
	for each pageDef in PageDefs
		Set pages = Form.GetPagesForTemplate(pageDef)
		For i = 1 To pages.Count
			pages.Item(i).Fields.ItemByName("PageTotal").SetCheckValue Cstr(totalCount)
			pages.Item(i).Fields.ItemByName("PageNumber").SetCheckValue Cstr(currentShift+1)
			currentShift = currentShift + 1
		Next
	next
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
End Sub
Option Explicit

dim FormDefs
dim FormVersion
dim RowFieldsAll
dim RowFieldsReq
dim HeaderFieldsReq
dim FooterFieldsReq
dim RowFieldsReq_2
dim ReasonList
dim ReasonMisc

Call InitValues

' This function starts execution of the script
Sub Main()
	dim formFields
	
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	Call ValidateHeader(formFields)
	Call ValidateFooter(formFields)
	Call RecalcBody
	Call ResetReasonOnMain
End Sub

Sub onAppend()
	'Add your code here
End Sub

Sub onInit()
	form.getpagesForTemplate(FormDefs(0)).Item(1).fields.itembyname("DocDate").setCheckValue "" & Form.FormatDate(date)
	Call SetFormCodeVers(FormDefs(0), 0, FormVersion)
	Call SetOnChangedHandlers
End Sub

Sub InitValues()
	Form.SetDefaultDecimalSeparator ","
	Form.SetDefaultDateFormat DF_YearMonthDay, YL_FourDigits, "-"
	
	ReasonList = Array(_
	Array("01","tėvystės atostogos",Array()),_
	Array("02","atostogos vaikui prižiūrėti",Array()),_
	Array("03","atostogos vaikui prižiūrėti (DK 180 str. 2 d. iki 2017-06-30)",Array()),_
	Array("04","atostogos vaikui prižiūrėti (DK 134 str. 2 d. nuo 2017-07-01)",Array()),_
	Array("05","14 kalendorinių dienų atostogos (DK 132 str. 1d. nuo 2017-07-01)",Array()),_
	Array("06","tėvystės atostogos (DK 133 str. 2d. nuo 2018-01-01)",Array()),_
	Array("07","atostogos senelei (seneliui) vaikui prižiūrėti iki 3 metų",Array())_
	)
	
	ReasonMisc = "99"
	
	'-- Other form variables --
	FormDefs = Array("9-SD")
	FormVersion = "06"

	RowFieldsAll = Array("PersonCode", "InsuranceSeries", "InsuranceNumber", "PersonFirstName", "PersonLastName", "HolidayStartDate", "HolidayEndDate", "HolidayCancelDate", "ChildBirthDate", "ChildPersonCode","ReasonCode_1","ReasonText_1")
	RowFieldsReq = Array("PersonFirstName", "PersonLastName", "HolidayStartDate", "HolidayEndDate", "ChildBirthDate","ReasonCode_1")
	HeaderFieldsReq = Array("InsurerName", "InsurerAddress")
	FooterFieldsReq = Array("ManagerFullName", "PreparatorDetails")
	RowFieldsReq_2 = Array("InsuranceSeries_", "InsuranceNumber_", "PersonCode_")
End Sub

Sub ValidateHeader(Fields)
	If CompleteFieldSet(Fields, GetFieldNames(HeaderFieldsReq, 0), False) then
		if not (Fields.ItemByName("JuridicalPersonCode").value = "") then
			Call validateJuridicalCode(Fields.ItemByName("JuridicalPersonCode"))
		end if
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
	dim formFields
	dim men, men_tev
	'FormVersion ir FormCode uzdejimas paspaudus TIKRINTI
	Call SetFormCodeVers(FormDefs(0), 0, FormVersion)
		
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	If not CompleteFieldSet(formFields, GetFieldNames(RowFieldsReq, 0), False) then
		form.setError "Neįvesti būtini apdraustojo duomenys", GetFieldObjects(formFields, RowFieldsReq, 0), EL_ERROR
	else
		'Patikrinam del asmens kodo ir SD numerio pildymo
	 	if ((FormFields.ItemByName("InsuranceSeries").value = "" and FormFields.ItemByName("InsuranceNumber").value <> "") or (FormFields.ItemByName("InsuranceSeries").value <> "" and FormFields.ItemByName("InsuranceNumber").value = "")) or (FormFields.ItemByName("InsuranceSeries").value = "" and FormFields.ItemByName("InsuranceNumber").value = "" and FormFields.ItemByName("PersonCode").value = "") then
			form.setError "Nekorektiškas asmens socialinio draudimo arba asmens kodo numeris", GetFieldObjects(FormFields, Array("InsuranceSeries","InsuranceNumber","PersonCode"), 0), EL_ERROR
	 	end if
	
		if Not (FormFields.ItemByName("PersonCode").value = "") then
			Call validatePersonCode(FormFields.ItemByName("PersonCode"))
		end if
		if DateDiff("d", FormFields.ItemByName("HolidayStartDate").toDate, FormFields.ItemByName("HolidayEndDate").toDate) < 0 then
			form.setError "Atostogų pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("HolidayStartDate","HolidayEndDate"), 0), EL_ERROR
		end if
		if not FormFields.ItemByName("HolidayCancelDate").value = "" then
			if (DateDiff("d", FormFields.ItemByName("HolidayStartDate").toDate, FormFields.ItemByName("HolidayCancelDate").toDate) < 0) or (DateDiff("d", FormFields.ItemByName("HolidayEndDate").toDate, FormFields.ItemByName("HolidayCancelDate").toDate) > 0) then
				form.setError "Atostogų atšaukimo data negali būti ankstesnė už atostogų pradžią ir vėlesnė už atostogų pabaigą", GetFieldObjects(FormFields, Array("HolidayStartDate","HolidayEndDate","HolidayCancelDate"), 0), EL_ERROR
			end if
			if DateDiff("d", FormFields.ItemByName("HolidayCancelDate").toDate, FormFields.ItemByName("ChildBirthDate").toDate) > 0 then
				form.setError "Vaiko gimimo data negali būti vėlesnė už atostogų atšaukimo datą", GetFieldObjects(FormFields, Array("ChildBirthDate","HolidayCancelDate"), 0), EL_ERROR
			end if
		end if
		if Not (FormFields.ItemByName("ChildPersonCode").value = "") then
			Call validatePersonCode(FormFields.ItemByName("ChildPersonCode"))
		end if
		if DateDiff("d", FormFields.ItemByName("HolidayStartDate").toDate, FormFields.ItemByName("ChildBirthDate").toDate) > 0 then
			form.setError "Laukelyje A15 (atostogos suteiktos nuo) nurodyta data negali būti ankstesnė nei vaiko gimimo data, kuri nurodyta laukelyje A18", GetFieldObjects(FormFields, Array("HolidayStartDate","ChildBirthDate"), 0), EL_ERROR
		end if
		
		if formFields.ItemByName("ReasonCode_1").value = "" or formFields.ItemByName("ReasonText_1").value = "" then 
		  form.setError "Neįvesta duomenų tikslinimo priežastis", Array(FormFields.ItemByName("ReasonCode_1"), FormFields.ItemByName("ReasonText_1")), EL_ERROR
		else
	    	if ValidateReason(FormFields, FormFields.ItemByName("ReasonCode_1").value) then 
				if FormFields.ItemByName("ReasonCode_1").value = "01" then
					if FormFields.ItemByName("HolidayStartDate").toDate >= DateValue("2017-07-01") then
						if FormFields.ItemByName("HolidayStartDate").value <> "" and FormFields.ItemByName("HolidayEndDate").value <> "" then
						  if FormFields.ItemByName("HolidayStartDate").toDate >= DateValue("2020-01-01") then
						    men_tev = 12
							else
                men_tev = 6
							end if
						  if DateAdd("m", men_tev, FormFields.ItemByName("ChildBirthDate").toDate) < FormFields.ItemByName("HolidayStartDate").toDate then
								form.setError "Nenurodyta arba neteisingai nurodyta atostogų suteikimo data (laukelis A15) arba vaiko gimimo data (laukelis A18)", GetFieldObjects(FormFields, Array("ChildBirthDate","HolidayStartDate"), 0), EL_ERROR
							end if
							if DateAdd("m", men_tev, FormFields.ItemByName("ChildBirthDate").toDate) < FormFields.ItemByName("HolidayEndDate").toDate then
								form.setError "Nenurodyta arba blogai nurodyta iki kada suteiktos atostogos (laukelis A16)", GetFieldObjects(FormFields, Array("ChildBirthDate","HolidayEndDate"), 0), EL_ERROR
							end if							
							if FormFields.ItemByName("HolidayEndDate").toDate - FormFields.ItemByName("HolidayStartDate").toDate + 1 > 30 then
								form.setError "Darbo kodekso 133 str. 1d. nustatyta 30 kalendorinių dienų tėvystės atostogų trukmė", GetFieldObjects(FormFields, Array("HolidayStartDate","HolidayEndDate"), 0), EL_ERROR
							end if
						end if
					else
						if DatePart("m",FormFields.ItemByName("HolidayEndDate").toDate) = DatePart("m",FormFields.ItemByName("ChildBirthDate").toDate)+1 then
							if DatePart("d",FormFields.ItemByName("HolidayEndDate").toDate) > DatePart("d",FormFields.ItemByName("ChildBirthDate").toDate) then
								form.setError "Laukelyje A16 (atostogos suteiktos iki) nurodyta data negali būti vėlesnė nei vaikui sukaks vienas mėnuo", GetFieldObjects(FormFields, Array("HolidayEndDate","ChildBirthDate"), 0), EL_ERROR
							end if
						else
							if DatePart("m",FormFields.ItemByName("HolidayEndDate").toDate) > DatePart("m",FormFields.ItemByName("ChildBirthDate").toDate)+1 then
								form.setError "Laukelyje A16 (atostogos suteiktos iki) nurodyta data negali būti vėlesnė nei vaikui sukaks vienas mėnuo", GetFieldObjects(FormFields, Array("HolidayEndDate","ChildBirthDate"), 0), EL_ERROR
							end if
						end if
					end if
				end if
				
				if FormFields.ItemByName("ReasonCode_1").value = "02" then
					if DateDiff("d", DateAdd("m", 36, FormFields.ItemByName("ChildBirthDate").toDate), FormFields.ItemByName("HolidayEndDate").toDate) > 0 then
						form.setError "Atostogos negali būti suteiktos daugiau kaip iki vaikui sukaks 3 metai", GetFieldObjects(FormFields, Array("ChildBirthDate","HolidayEndDate"), 0), EL_ERROR
					end if
				end if
								
				if (FormFields.ItemByName("ReasonCode_1").value = "03" and FormFields.ItemByName("HolidayStartDate").toDate >= DateValue("2017-07-01")) or ((FormFields.ItemByName("ReasonCode_1").value = "04" or FormFields.ItemByName("ReasonCode_1").value = "05") and FormFields.ItemByName("HolidayStartDate").toDate < DateValue("2017-07-01")) then	
					form.setError "Neteisingai nurodyta pranešimo pateikimo priežastis arba vaiko priežiūros atostogų suteikimo data", GetFieldObjects(FormFields, Array("ReasonCode_1","HolidayStartDate"), 0), EL_ERROR
				end if
				
				men = 3
				if FormFields.ItemByName("ReasonCode_1").value = "03" or FormFields.ItemByName("ReasonCode_1").value = "04" then
				  if FormFields.ItemByName("ReasonCode_1").value = "04" then 
					  if FormFields.ItemByName("HolidayStartDate").toDate >= DateValue("2018-01-01") then
						  men = 24
						end if
					end if
					if DateAdd("m", men, FormFields.ItemByName("HolidayStartDate").toDate) < FormFields.ItemByName("HolidayEndDate").toDate then
						form.setError "Laukelyje A16 (atostogos suteiktos iki) nurodyta data negali būti vėlesnė negu "&men&" mėnesiai nuo atostogų suteikimo datos, kuri nurodyta laukelyje A15", GetFieldObjects(FormFields, Array("HolidayEndDate","HolidayStartDate"), 0), EL_ERROR	
					end if
					if DateDiff("d", DateAdd("m", 12*18, FormFields.ItemByName("ChildBirthDate").toDate), FormFields.ItemByName("HolidayEndDate").toDate) > 0 then
						form.setError "Atostogos negali būti suteiktos daugiau kaip iki vaikui sukaks 18 metų", GetFieldObjects(FormFields, Array("ChildBirthDate","HolidayEndDate"), 0), EL_ERROR
					end if
				end if
				
				if FormFields.ItemByName("ReasonCode_1").value = "06" and FormFields.ItemByName("HolidayStartDate").toDate < DateValue("2018-01-01") then
					form.setError "Neteisingai nurodyta pranešimo pateikimo priežastis arba tėvystės atostogų suteikimo data", GetFieldObjects(FormFields, Array("ReasonCode_1","HolidayStartDate"), 0), EL_ERROR
				end if
				
				if FormFields.ItemByName("ReasonCode_1").value = "07" and FormFields.ItemByName("HolidayStartDate").toDate < DateValue("2018-04-01") then
					form.setError "Neteisingai nurodyta pranešimo pateikimo priežastis arba atostogų suteikimo data", GetFieldObjects(FormFields, Array("ReasonCode_1","HolidayStartDate"), 0), EL_ERROR
				end if
				
			end if
		end if
	end if
End Sub

Function ValidateReason(FormFields, RsnCode)
	dim rsnText
	dim rsnTextExist
	dim rsnDetText
	
	ValidateReason = false
	
	rsnText = ucase(GetReasonTextByCode(RsnCode))
	rsnTextExist = ucase(FormFields.ItemByName("ReasonText_1").value)
	if not (rsnTextExist = rsnText) then
		FormFields.ItemByName("ReasonText_1").SetCheckValue(rsnText)
		rsnTextExist = rsnText
	end if
	
	if trim(rsnTextExist) = "" then
		form.setError "Nenurodytas pranešimo pateikimo priežasties atvejis ", Array(FormFields.ItemByName("ReasonText_1")), EL_ERROR
		exit function
	end if
	
	ValidateReason = true
End FUnction

Sub SetOnChangedHandlers
	Call form.SetOnChangedHandlerEx("OnChangeR", Cstr(FormDefs(0)), "ReasonCode_1")
End sub

Sub OnChangeR(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode

	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_1").Value
	Call formFields.ItemByName("ReasonText_1").SetCheckValue(GetReasonTextByCode(selectedCode))
End Sub

Sub OnChangeRD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode, selectedDetCode, selectedDetText

	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_1").Value
End Sub

Sub ResetReasonOnMain
	Call OnChangeROnMain(FormDefs(0))
End Sub

Sub OnChangeROnMain(PageDefName)
	dim pages, formFields
	dim selectedCode
	dim selectedCodeDet

	set pages = Form.GetPagesForTemplate(PageDefName)
	set formFields = pages.Item(1).Fields
	selectedCode = formFields.ItemByName("ReasonCode_1").Value
	Call formFields.ItemByName("ReasonText_1").SetCheckValue(GetReasonTextByCode(selectedCode))
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
	validatePersonCode = true ' apie nekorektišką a/k tik informuojama (warning), nebent <11 simboliu
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
			'Form.SetError "Asmens kode nekorektiškai nurodyta gimimo data ("& cstr(GimD) &")", Array(AK), EL_WARNING
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
			'Form.SetError "Asmens kode nekorektiškas kontrolinis skaitmuo", Array(AK), EL_WARNING
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



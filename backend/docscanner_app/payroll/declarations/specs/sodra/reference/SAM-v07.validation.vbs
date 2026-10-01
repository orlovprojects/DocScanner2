Option Explicit

dim ReasonList
dim ReasonMisc
dim FormDefs
dim FormVersion
dim RowCountSupl3SD
dim RowFieldsAll3SD
dim RowFieldsReq3SD
dim RowFieldsReq3SD_2
dim RowCountSupl3SDP
dim RowFieldsAll3SDP
dim RowFieldsReq3SDP
dim RowFieldsReq3SDP_2
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
	Call SetPageNumbers(Array(FormDefs(1)))
	Call SetPageNumbers(Array(FormDefs(2)))
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(1), Array("InsurerCode","DocDate","DocNumber"))
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(2), Array("InsurerCode","DocDate","DocNumber"))
	
	Call ValidateHeader(formFields)
	Call ValidateFooter(formFields)
	criticalError = not ValidateMainPage(formFields)
	
	if not criticalError then
		if FormFields.ItemByName("Appendixes2").value = "1" then Call RecalcBody3SD
		if FormFields.ItemByName("Appendixes3").value = "1" then Call RecalcBody3SDP
	end if
	
	PrieduTikrinimas
End Sub

Sub PrieduTikrinimas
  dim pages, fields
	set pages = form.getpagesfortemplate("SAM")
	set fields = pages.item(1).fields

	if (ACount("SAM3SD") = 0) and (ACount("SAM3SDP") = 0) then
	  form.setError "Turi būti įterptas bent vienas priedas",array(fields.itemByName("Appendixes2"), fields.itemByName("Appendixes3")), EL_ERROR
	end if
end sub

Sub onAppend()
	'Add your code here
End Sub

Sub onInit()
	form.getpagesForTemplate(FormDefs(0)).Item(1).fields.itembyname("DocDate").setCheckValue "" & Form.FormatDate(date)
	Call SetFormCodeVers(FormDefs(0), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(1), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(2), 0, FormVersion)
	Call SetPageNumbers(Array(FormDefs(1)))
	Call SetPageNumbers(Array(FormDefs(2)))
	Call SetOnChangedHandlers
End Sub

Sub onAddPage(PageName, PageIndex)
	Call SetPageNumbers(Array(FormDefs(1)))
	Call SetPageNumbers(Array(FormDefs(2)))
	Call SetFormCodeVers(PageName, PageIndex, FormVersion)
End Sub

Sub InitValues()
	Form.SetDefaultDecimalSeparator ","
	Form.SetDefaultDateFormat DF_YearMonthDay, YL_FourDigits, "-"
	'-- ReasonList classificator values ------------------------------------
	ReasonList = Array(_
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
	ReasonMisc = "99"
	'-- Other form variables --
	FormDefs = Array("SAM","SAM3SD","SAM3SDP")
	FormVersion = "07"

	RowCountSupl3SD = 6
	RowCountSupl3SDP = 3
	
	HeaderFieldsReq = Array("InsurerName", "InsurerAddress")
	FooterFieldsReq = Array("ManagerFullName", "PreparatorDetails")
	RowFieldsAll3SD = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_","PersonFirstName_","PersonLastName_","InsIncomeSum_","PaymentSum_","TaxRate_")
	RowFieldsReq3SD = Array("PersonFirstName_","PersonLastName_","InsIncomeSum_")
	RowFieldsReq3SD_2 = Array("InsuranceSeries_", "InsuranceNumber_", "PersonCode_")
	RowFieldsAll3SDP = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_","PersonFirstName_","PersonLastName_","ReasonCode_","ReasonText_","PeriodStartDate_","PeriodEndDate_","InsIncomeSum_","PaymentSum_","TaxRate_")
	RowFieldsReq3SDP = Array("PersonFirstName_","PersonLastName_","ReasonCode_","PeriodStartDate_","PeriodEndDate_","InsIncomeSum_")
	RowFieldsReq3SDP_2 = Array("InsuranceSeries_", "InsuranceNumber_", "PersonCode_")
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

Function ValidateMainPage(FormFields)
	ValidateMainPage = True
	
	if not formFields.ItemByName("RevisedDocument").value = "1" then
		formFields.ItemByName("Apdx2PersonCount").SetCheckValue("")
		formFields.ItemByName("Apdx2InsIncomeSum").SetCheckValue("")
		formFields.ItemByName("Apdx2PaymentSum").SetCheckValue("")
		formFields.ItemByName("Apdx3PersonCount").SetCheckValue("")
		formFields.ItemByName("Apdx3InsIncomeSum").SetCheckValue("")
		formFields.ItemByName("Apdx3PaymentSum").SetCheckValue("")
	else
		if CompleteFieldsetAny(FormFields, Array("RevisedCycleYear")) then
			if not CompleteFieldsetAny(FormFields, Array("RevisedCycleMonth")) then
				form.setError "Turi būti užpildytas laukas P17T", GetFieldObjects(FormFields, Array("RevisedCycleMonth"), 0), EL_ERROR
			end if
		else
			form.setError "Reikia nurodyti tikslinamo dokumento laikotarpį", GetFieldObjects(FormFields, Array("RevisedCycleYear"), 0), EL_ERROR
		end if
	end if
	
	if not CompleteFieldset(FormFields, Array("CycleYear","CycleMonth"), False) AND not formFields.ItemByName("RevisedDocument").value = "1" then
		form.setError "Turi būti nurodytas ataskaitinis laikotarpis, arba pažymėtas tikslinamo dokumento laukelis P35", GetFieldObjects(FormFields, Array("CycleYear", "CycleMonth", "RevisedDocument"), 0), EL_ERROR
		ValidateMainPage = False
	else
		if CompleteFieldsetAny(FormFields, Array("CycleYear","CycleMonth")) then
			if CompleteFieldsetAny(FormFields, Array("RevisedCycleYear", "RevisedCycleMonth")) OR formFields.ItemByName("RevisedDocument").value = "1" then
				form.setError "Jeigu užpildyti P14 ir P17 laukeliai, tai P35, P14T, P15T ir P17T laukeliai nepildomi ir atvirkščiai, jeigu užpildyti P35, P14T, P15T ar P17T, tokiu atveju laukeliai P14 ir P17 nepildomi", GetFieldObjects(FormFields, Array("RevisedDocument", "CycleYear", "CycleMonth"), 0), EL_ERROR
			end if
		end if
	end if

	ValidateMainPage = ValidateMainPage and ValidateTitleRow(FormFields, "SAM3SD", 2)
	ValidateMainPage = ValidateMainPage and ValidateTitleRow(FormFields, "SAM3SDP", 3)
	Call formFields.ItemByName("ApdxPageCountTotal").SetCheckValue(Cstr(GetPageCount(FormDefs)-1))
End Function

Function ValidateTitleRow(FormFields, FormDefName, RowNum)
	dim pageCount
	
	ValidateTitleRow = true
	Call formFields.ItemByName("Apdx"&RowNum&"PageCount").SetCheckValue("")
	pageCount = GetPageCount(Array(FormDefName))
	if pageCount > 0 then Call formFields.ItemByName("Apdx"&RowNum&"PageCount").SetCheckValue(Cstr(pageCount))
	if pageCount > 0 and FormFields.ItemByName("Appendixes"&RowNum).value = "0" then
		form.setError "Pažymėkite priedą "&FormDefName&" arba pašalinkite jo puslapius", Array(FormFields.ItemByName("Appendixes"&RowNum)), EL_ERROR
		ValidateTitleRow = false
	elseif pageCount = 0 and FormFields.ItemByName("Appendixes"&RowNum).value = "1" then
		form.setError "Nužymėkite priedą "&FormDefName&" arba įterpkite jo puslapius", Array(FormFields.ItemByName("Appendixes"&RowNum)), EL_ERROR
		ValidateTitleRow = false
	end if
End Function

Function RecalcBody3SD
	dim formFields, formFields2
	dim pageCount, rowCount
	dim i, j, p, i2, j2
	dim insIncomeTotal, paymentTotal, insIncomePage, paymentPage
	dim tusciaEilute3SD
	dim asd
	
	'FormVersion ir FormCode uzdejimas paspaudus TIKRINTI
	Call SetFormCodeVers(FormDefs(0), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(1), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(2), 0, FormVersion)
	
	RecalcBody3SD = true
	rowCount = 0
	insIncomeTotal = 0
	paymentTotal = 0
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	
	pageCount = ACount(FormDefs(1))
	for j = 1 to pageCount
		insIncomePage = 0
		paymentPage = 0
		p = 0
		set formFields = form.getpagesForTemplate(FormDefs(1)).Item(j).fields
		for i = 1 to RowCountSupl3SD
			'formFields.ItemByName("PaymentSum_"&Cstr(i)).SetCheckValue("")
			if CompleteFieldsetAny(formFields, GetFieldNames(RowFieldsAll3SD, i)) then
				rowCount = rowCount + 1
				p = p + 1
				
				formFields.ItemByName("RowNumber_"&Cstr(i)).SetCheckValue Cstr(rowCount)
				if ValidateRow3SD(formFields, j, i) then
					if RecalcRowPayment3SD(formFields, i) then
						insIncomePage = insIncomePage + FormFields.ItemByName("InsIncomeSum_"&Cstr(i)).toDecimal
						paymentPage = paymentPage + FormFields.ItemByName("PaymentSum_"&Cstr(i)).toDecimal
					end if
				end if
			else
				Call formFields.ItemByName("RowNumber_"&i).SetCheckValue("")
			end if
		next
		insIncomeTotal = insIncomeTotal + insIncomePage
		paymentTotal = paymentTotal + paymentPage
		Call formFields.ItemByName("InsIncomePage").SetCheckValue(Form.FormatDecimal(insIncomePage))
		Call formFields.ItemByName("PaymentPage").SetCheckValue(Form.FormatDecimal(paymentPage))
		if p = 0 then
			form.setError "Neužpildytas priedo SAM3SD "&Cstr(j)&" lapas. Jei jis nereikalingas, pašalinkite jį.", GetFieldObjects(formFields, Array("FormCode"), 0), EL_ERROR
		end if
	next
	Call PazymetiTuscius(FormDefs(1), "SAM3SD", pageCount, RowCountSupl3SD, RowFieldsAll3SD)
	
	'totals
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	if not formFields.ItemByName("RevisedDocument").value = "1" then
		Call formFields.ItemByName("Apdx2PersonCount").SetCheckValue(Cstr(rowCount))
		Call formFields.ItemByName("Apdx2InsIncomeSum").SetCheckValue(Form.FormatDecimal(insIncomeTotal))
		Call formFields.ItemByName("Apdx2PaymentSum").SetCheckValue(Form.FormatDecimal(paymentTotal))
	end if
	if rowCount = 0 then 
		form.setError "Neįvesti nei vieno apdraustojo duomenys SAM3SD priede", GetFieldObjects(form.getpagesForTemplate(FormDefs(1)).Item(1).fields, RowFieldsReq3SD, 1), EL_ERROR
		RecalcBody3SD = false
	end if
end Function

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

Function SkaiciuotiUnikalius3SDP (RCS)
	dim pageCount, rowCount, formFields, formFields2
	dim totalPersonCount
	dim i, j, p, g, h, t, i2, j2, k, e, e2
	dim uniquePersonCount, uniqueSDCount, uniquePersonArray(60000), uniquePCode, uniqueSDArray(60000), uniqueSD 'DT19-(08)015
	dim priskirti, tusciaEilute, tusti(5)
	
	tusciaEilute = false
	rowCount = 0
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	for h = 1 to 60000
		uniquePersonArray(h) = "1"
	next
	for h = 1 to 60000
		uniqueSDArray(h) = ""
	next		
	uniquePersonCount = 1
	uniqueSDCount = 1
	totalPersonCount = 0
	
	pageCount = ACount(FormDefs(2))
	for j = 1 to pageCount
		set formFields = form.getpagesForTemplate(FormDefs(2)).Item(j).fields
		for i = 1 to RCS
			if formFields.ItemByName("PersonCode_"&Cstr(i)).toDecimal <> 0 then
				uniquePCode = formFields.ItemByName("PersonCode_"&Cstr(i)).toDecimal
				uniqueSD = formFields.ItemByName("InsuranceSeries_"&Cstr(i)).value & formFields.ItemByName("InsuranceNumber_"&Cstr(i)).value
				priskirti = true
				for g = 1 to uniquePersonCount
					if uniquePersonArray(g) = uniquePCode then
						priskirti = false
					end if
				next
				if priskirti then
					totalPersonCount = totalPersonCount + 1
					uniquePersonCount = uniquePersonCount +1
					uniquePersonArray(uniquePersonCount) = uniquePCode
					uniqueSDCount = uniqueSDCount + 1
					uniqueSDArray(uniqueSDCount) = uniqueSD
				end if
			else
				uniquePCode = formFields.ItemByName("PersonCode_"&Cstr(i)).toDecimal
				uniqueSD = formFields.ItemByName("InsuranceSeries_"&Cstr(i)).value & formFields.ItemByName("InsuranceNumber_"&Cstr(i)).value
				priskirti = true
				for h = 1 to uniqueSDCount
					if uniqueSDArray(h) = uniqueSD then
						priskirti = false
					end if
				next
				if priskirti then
					totalPersonCount = totalPersonCount + 1
					uniquePersonCount = uniquePersonCount +1
					uniquePersonArray(uniquePersonCount) = uniquePCode
					uniqueSDCount = uniqueSDCount + 1
					uniqueSDArray(uniqueSDCount) = uniqueSD
				end if
			end if	
		next
	next
	SkaiciuotiUnikalius3SDP = totalPersonCount
End Function

Function RecalcBody3SDP
	dim formFields, formFields2
	dim pageCount, rowCount, totalPersonCount
	dim i, j, p, g, h, t, i2, j2, k, e, e2
	dim insIncomeTotal, paymentTotal, insIncomePage, paymentPage
	dim uniquePersonCount, uniqueSDCount, uniquePersonArray(60000), uniquePCode, uniqueSDArray(60000), uniqueSD 'DT19-(08)015
	dim priskirti, tusciaEilute, tusti(5)
	dim asd
	
	'FormVersion ir FormCode uzdejimas paspaudus TIKRINTI
	Call SetFormCodeVers(FormDefs(0), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(1), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(2), 0, FormVersion)
	
	RecalcBody3SDP = true
	tusciaEilute = false
	rowCount = 0
	insIncomeTotal = 0
	paymentTotal = 0
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	for h = 1 to 60000 'DT19-(08)015
		uniquePersonArray(h) = "0"
	next
	for h = 1 to 60000
		uniqueSDArray(h) = "0"
	next
	
	uniquePersonCount = 1
	uniqueSDCount = 1
	t = 0
	
	pageCount = ACount(FormDefs(2))
	for j = 1 to pageCount
		insIncomePage = 0
		paymentPage = 0
		p = 0
		set formFields = form.getpagesForTemplate(FormDefs(2)).Item(j).fields
		for i = 1 to RowCountSupl3SDP
			'formFields.ItemByName("PaymentSum_"&Cstr(i)).SetCheckValue("")
			if CompleteFieldsetAny(formFields, GetFieldNames(RowFieldsAll3SDP, i)) then
				rowCount = rowCount + 1
				p = p + 1				
				
				formFields.ItemByName("RowNumber_"&Cstr(i)).SetCheckValue Cstr(rowCount)
				if ValidateRow3SDP(formFields, j, i) then
					if RecalcRowPayment(formFields, i) then
						insIncomePage = insIncomePage + FormFields.ItemByName("InsIncomeSum_"&Cstr(i)).toDecimal
						paymentPage = paymentPage + FormFields.ItemByName("PaymentSum_"&Cstr(i)).toDecimal
					end if
				end if
			else
				Call formFields.ItemByName("RowNumber_"&i).SetCheckValue("")
			end if
		next
		insIncomeTotal = insIncomeTotal + insIncomePage
		paymentTotal = paymentTotal + paymentPage
		Call formFields.ItemByName("InsIncomePage").SetCheckValue(Form.FormatDecimal(insIncomePage))
		Call formFields.ItemByName("PaymentPage").SetCheckValue(Form.FormatDecimal(paymentPage))
		if p = 0 then
			form.setError "Neužpildytas priedo SAM3SDP "&Cstr(j)&" lapas. Jei jis nereikalingas, pašalinkite jį.", GetFieldObjects(formFields, Array("FormCode"), 0), EL_ERROR
		end if
	next
	'Call SkaiciuotiUnikalius3SDP(RowCountSupl3SDP)
	Call PazymetiTuscius(FormDefs(2), "SAM3SDP", PageCount, RowCountSupl3SDP, RowFieldsAll3SDP)
	
	'totals
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	if not formFields.ItemByName("RevisedDocument").value = "1" then
		Call formFields.ItemByName("Apdx3PersonCount").SetCheckValue(Cstr(SkaiciuotiUnikalius3SDP(RowCountSupl3SDP))) 'DT19-(08)015
		Call formFields.ItemByName("Apdx3InsIncomeSum").SetCheckValue(Form.FormatDecimal(insIncomeTotal))
		Call formFields.ItemByName("Apdx3PaymentSum").SetCheckValue(Form.FormatDecimal(paymentTotal))
	end if
	if rowCount = 0 then 
		form.setError "Neįvesti nei vieno apdraustojo duomenys SAM3SDP priede", GetFieldObjects(form.getpagesForTemplate(FormDefs(2)).Item(1).fields, RowFieldsReq3SDP, 1), EL_ERROR
		RecalcBody3SDP = false
	end if
end Function

Function ValidateRow3SD(FormFields, PageNum, RowNum)
	dim TaxRate, Year, IncomeSum, PaymentSum, SumToExpect, SumDiff
	ValidateRow3SD = false
	
	if Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReq3SD, RowNum), False) then
		form.setError "Neįvesti būtini apdraustojo duomenys SAM3SD priedo "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq3SD, RowNum), EL_ERROR
		Exit Function
	end if	
	
	if Not (FormFields.ItemByName("PersonCode_"&RowNum).value = "") then
		If not validatePersonCode(FormFields.ItemByName("PersonCode_"&RowNum)) Then Exit Function
	end if	

	'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_"&RowNum).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value = "" and FormFields.ItemByName("PersonCode_"&RowNum).value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq3SD_2, RowNum), EL_ERROR
	end if
	
	if FormFields.itemByName("TaxRate_"&RowNum).value = "" then
		form.setError "Turi būti nurodytas bendras įmokų tarifas "&PageNum&" lapo "&RowNum&" eilutėje", array(FormFields.itemByName("TaxRate_"&RowNum)), EL_ERROR
		Exit Function
	end if
	
	TaxRate = FormFields.itemByName("TaxRate_"&RowNum).toDecimal
	
	if form.getpagesForTemplate(FormDefs(0)).Item(1).fields.ItemByName("CycleYear").value <> "" then
		Year = form.getpagesForTemplate(FormDefs(0)).Item(1).fields.ItemByName("CycleYear").value
	elseif form.getpagesForTemplate(FormDefs(0)).Item(1).fields.ItemByName("RevisedCycleYear").value <> "" then
		Year = form.getpagesForTemplate(FormDefs(0)).Item(1).fields.ItemByName("RevisedCycleYear").value
	end if	
	
	if (TaxRate < 0.01 or TaxRate > 99.99) then
		form.setError "Tarifas turi būti skaičius nuo 0,01 iki 99,99 "&PageNum&" lapo "&RowNum&" eilutėje", array(FormFields.itemByName("TaxRate_"&RowNum)), EL_ERROR
		Exit Function
	end if
	
	IncomeSum = FormFields.ItemByName("InsIncomeSum_"&RowNum).toDecimal
	PaymentSum = FormFields.ItemByName("PaymentSum_"&RowNum).toDecimal
	SumToExpect = round(IncomeSum*TaxRate/100, 2)
	
	if FormFields.ItemByName("PaymentSum_"&RowNum).value = "" AND NOT FormFields.ItemByName("InsIncomeSum_"&RowNum).value = "" then ' skaiciuojama ir uzpildoma
			FormFields.ItemByName("PaymentSum_"&RowNum).SetCheckValue(Form.FormatDecimal(SumToExpect))
			PaymentSum = FormFields.ItemByName("PaymentSum_"&RowNum).toDecimal
	end if
	
	ValidateRow3SD = true
End function

Function ValidateRow3SDP(FormFields, PageNum, RowNum)
	ValidateRow3SDP = false
	dim rsnCode, qY, qM, pStartY, pStartM, pEndY, pEndM, TaxRate, IncomeSum, PaymentSum, SumToExpect, SumDiff
	dim FormFields0, Year
	
	set FormFields0 = form.getpagesForTemplate(FormDefs(0)).Item(1).fields

	if not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReq3SDP, RowNum), False) then
		form.setError "Neįvesti būtini apdraustojo duomenys SAM3SDP priedo "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq3SDP, RowNum), EL_ERROR
		Exit function
	end if
	
	if Not (FormFields.ItemByName("PersonCode_"&RowNum).value = "") then
		If not validatePersonCode(FormFields.ItemByName("PersonCode_"&RowNum)) Then Exit Function
	end if
	
	'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_"&RowNum).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value = "" and FormFields.ItemByName("PersonCode_"&RowNum).value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq3SDP_2, RowNum), EL_ERROR
	end if
	
	if FormFields.itemByName("TaxRate_"&RowNum).value = "" then
		form.setError "Turi būti nurodytas bendras įmokų tarifas "&PageNum&" lapo "&RowNum&" eilutėje", array(FormFields.itemByName("TaxRate_"&RowNum)), EL_ERROR
		Exit Function
	end if
	
	TaxRate = FormFields.itemByName("TaxRate_"&RowNum).toDecimal
	
	if form.getpagesForTemplate(FormDefs(0)).Item(1).fields.ItemByName("CycleYear").value <> "" then
		Year = form.getpagesForTemplate(FormDefs(0)).Item(1).fields.ItemByName("CycleYear").value
	elseif form.getpagesForTemplate(FormDefs(0)).Item(1).fields.ItemByName("RevisedCycleYear").value <> "" then
		Year = form.getpagesForTemplate(FormDefs(0)).Item(1).fields.ItemByName("RevisedCycleYear").value
	end if	
	
	if (TaxRate < 0.01 or TaxRate > 99.99) then
		form.setError "Tarifas turi būti skaičius nuo 0,01 iki 99,99 "&PageNum&" lapo "&RowNum&" eilutėje", array(FormFields.itemByName("TaxRate_"&RowNum)), EL_ERROR
		Exit Function
	end if
	
	IncomeSum = FormFields.ItemByName("InsIncomeSum_"&RowNum).toDecimal
	PaymentSum = FormFields.ItemByName("PaymentSum_"&RowNum).toDecimal
	SumToExpect = round(IncomeSum*TaxRate/100, 2)
	
	if FormFields.ItemByName("PaymentSum_"&RowNum).value = "" AND NOT FormFields.ItemByName("InsIncomeSum_"&RowNum).value = "" then ' skaiciuojama ir uzpildoma
			FormFields.ItemByName("PaymentSum_"&RowNum).SetCheckValue(Form.FormatDecimal(SumToExpect))
			PaymentSum = FormFields.ItemByName("PaymentSum_"&RowNum).toDecimal
	end if
	
	rsnCode = FormFields.ItemByName("ReasonCode_"&RowNum).value
	if not ValidateReason(FormFields, PageNum, RowNum, rsnCode) then Exit Function
	
	if DateDiff("d", FormFields.ItemByName("PeriodStartDate_"&RowNum).toDate, FormFields.ItemByName("PeriodEndDate_"&RowNum).toDate) < 0 then
		form.setError "Valstybinio socialinio draudimo pabaigos data negali būti ankstesnė už pradžią", GetFieldObjects(FormFields, Array("PeriodStartDate_","PeriodEndDate_"), RowNum), EL_ERROR
		Exit function
	end if
	
	if CompleteFieldset(FormFields0, Array("CycleYear", "CycleMonth"), False) AND CompleteFieldset(FormFields, Array("PeriodStartDate_"&RowNum, "PeriodEndDate_"&RowNum), False) then
		qY = FormFields0.ItemByName("CycleYear").toDecimal
		qM = FormFields0.ItemByName("CycleMonth").toDecimal
		pStartY = DatePart("yyyy", FormFields.ItemByName("PeriodStartDate_"&RowNum).toDate)
		pEndY = DatePart("yyyy", FormFields.ItemByName("PeriodEndDate_"&RowNum).toDate)
		pStartM = DatePart("m", FormFields.ItemByName("PeriodStartDate_"&RowNum).toDate)
		pEndM = DatePart("m", FormFields.ItemByName("PeriodEndDate_"&RowNum).toDate)
		if qY <> pStartY OR qY <> pEndY OR qM <> pStartM OR qM <> pEndM then
			form.setError "Datos A21 ir A22 turi sutapti su ataskaitiniu laikotarpiu", GetFieldObjects(FormFields, Array("PeriodStartDate_","PeriodEndDate_"), RowNum), EL_ERROR
			Exit function
		end if
	end if
	
	ValidateRow3SDP = true
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
	
	ValidateReason = true
End FUnction

Function RecalcRowPayment(FormFields, RowNum)
	dim paymSum
	dim sumDiff
	dim FormFields0
	
	RecalcRowPayment = false
	set FormFields0 = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	
	if FormFields.ItemByName("InsIncomeSum_"&RowNum).toDecimal < 0 then
		form.setError "Lauke negali būti neigiama reikšmė", Array(FormFields.ItemByName("InsIncomeSum_"&RowNum)), EL_ERROR
		exit function
	else
		if FormFields.ItemByName("PaymentSum_"&RowNum).value = "" then ' skaiciuojama ir uzpildoma
			FormFields.ItemByName("PaymentSum_"&RowNum).SetCheckValue(Form.FormatDecimal(FormFields.ItemByName("InsIncomeSum_"&RowNum).toDecimal*FormFields.ItemByName("TaxRate_"&RowNum).toDecimal/100))
		else 
		'tikrinima su leistina paklaida
'			paymSum = FormFields.ItemByName("InsIncomeSum_"&RowNum).toDecimal*TaxRate/100
'			sumDiff = paymSum - FormFields.ItemByName("PaymentSum_"&RowNum).toDecimal
'			if not FormFields0.ItemByName("RevisedCycleQuarter").value = "" then
'				if abs(sumDiff) > 0.03 then
'					form.setError "Neteisingai nurodyta valstybinio socialinio draudimo įmokų suma", Array(FormFields.ItemByName("PaymentSum_"&RowNum)), EL_ERROR
'					exit function
'				end if
'			else
'				if abs(sumDiff) > 0.02 then
'					form.setError "Neteisingai nurodyta valstybinio socialinio draudimo įmokų suma", Array(FormFields.ItemByName("PaymentSum_"&RowNum)), EL_ERROR
'					exit function
'				end if
'			end if
		end if
	end if
	RecalcRowPayment = true
End Function

'DT19-(09)005 uzsakymas -----
Function RecalcRowPayment3SD(FormFields, RowNum)
	dim paymSum
	dim sumDiff
	dim FormFields0
	
	RecalcRowPayment3SD = false
		
	if FormFields.ItemByName("InsIncomeSum_"&RowNum).toDecimal < 0 then
		form.setError "Lauke negali būti neigiama reikšmė", Array(FormFields.ItemByName("InsIncomeSum_"&RowNum)), EL_ERROR
		exit function
	else
		if FormFields.ItemByName("PaymentSum_"&RowNum).value = "" then ' skaiciujama ir uzpildoma
			FormFields.ItemByName("PaymentSum_"&RowNum).SetCheckValue(Form.FormatDecimal(FormFields.ItemByName("InsIncomeSum_"&RowNum).toDecimal*FormFields.ItemByName("TaxRate_"&RowNum).toDecimal/100))
		else
		'tikrinima su leistina paklaida
'			set FormFields0 = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
'			if (Cstr(FormFields0.ItemByName("CycleYear").value) = "2009") AND (Cstr(FormFields0.ItemByName("CycleMonth").value) = "1") then
'				paymSum = FormFields.ItemByName("InsIncomeSum_"&RowNum).toDecimal*TaxRate/100
'				sumDiff = paymSum - FormFields.ItemByName("PaymentSum_"&RowNum).toDecimal
'				if abs(sumDiff) > 0.03 then
'					form.setError "Neteisingai nurodyta valstybinio socialinio draudimo įmokų suma", Array(FormFields.ItemByName("PaymentSum_"&RowNum)), EL_WARNING
'				end if
'			else
'				paymSum = FormFields.ItemByName("InsIncomeSum_"&RowNum).toDecimal*TaxRate/100
'				sumDiff = paymSum - FormFields.ItemByName("PaymentSum_"&RowNum).toDecimal
'				if not FormFields0.ItemByName("RevisedCycleQuarter").value = "" then
'					if abs(sumDiff) > 0.03 then
'						form.setError "Neteisingai nurodyta valstybinio socialinio draudimo įmokų suma", Array(FormFields.ItemByName("PaymentSum_"&RowNum)), EL_ERROR
'						exit function
'					end if
'				else
'					if abs(sumDiff) > 0.02 then
'						form.setError "Neteisingai nurodyta valstybinio socialinio draudimo įmokų suma", Array(FormFields.ItemByName("PaymentSum_"&RowNum)), EL_ERROR
'						exit function
'					end if
'				end if
'			end if
		
		end if
	end if
	RecalcRowPayment3SD = true
End Function
'DT19-(09)005 uzsakymas -----			


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

'Function ArrayToString (Arr)
'	dim i
'	dim str
'	
'	for i = 0 to UBound(Arr)
'		str = str + String(Arr, ", ")
'	next
'	if i <> UBound(Arr) then
'		str = str + ", "
'	end if
'
'	ArrayToString = str
'End Function

Sub SetOnChangedHandlers
	dim i

	for i = 1 to RowCountSupl3SDP
		Call form.SetOnChangedHandlerEx("OnChangeR", Cstr(FormDefs(2)), "ReasonCode_"&Cstr(i))
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
		
	cn = Form.GetPagesForTemplate(FormDefs(2)).Count
	for j = 1 to cn
		for i = 1 to RowCountSupl3SDP
			Call OnChangeR(FormDefs(2), j, "ReasonCode_"&Cstr(i))
		next
	next
End Sub

Sub ResetReasonOnMain
	dim i

		for i = 1 to RowCountSupl3SDP
		Call OnChangeROnMain(FormDefs(2), i)
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

Function ValidateNr87
	dim M3, F6, F61, F3, P204, P205, P214, P215
	dim formFields, mainFormFields
	
	set formFields = form.getpagesForTemplate(FormDefs(1)).Item(1).fields
	set mainFormFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	F6 = CustCDbl(formFields.ItemByName("IncomeSum"))
	F61 = CustCDbl(formFields.ItemByName("IncomeExtraSum"))
	F3 = CustCDbl(formFields.itemByName("PersonCountEnded"))
	P204 = CustCDbl(mainFormFields.ItemByName("Apdx2InsIncomeSum"))
	P214 = CustCDbl(mainFormFields.ItemByName("Apdx3InsIncomeSum"))
	P205 = CustCDbl(mainFormFields.ItemByName("Apdx2PaymentSum"))
	P215 = CustCDbl(mainFormFields.ItemByName("Apdx3PaymentSum"))
	M3 = CustCDbl(formFields.ItemByName("ChargedMonthly"))
	' -------------- 1 ---------------
	if (F6 <> 0) and (F61 = 0) and (F3 = 0) then
		' ar F6 = P20.4 + P21.4
		if not (F6 = P204 + P214) then
			form.setError "Neteisingai nurodytos draudžiamosios pajamos", Array(FormFields.ItemByName("IncomeSum")), EL_ERROR
		end if
	end if
	' -------------- 2 ---------------
	if (F61 <> 0) and (F3 = 0) then
		' ar F6 - F6.1 = P20.4 + P21.4
		if not (F6 = P204 + P214 + F61) then
			form.setError "Neteisingai nurodytos draudžiamosios pajamos", Array(FormFields.ItemByName("IncomeSum")), EL_ERROR
		end if
	end if
	' -------------- 3 ---------------
	if (F6 <> 0) and (F61 = 0) and (F3 = 0) then
		' ar M3 = P20.5 + P21.5
		if (M3 < P205 + P215 - 1) then
			form.setError "Neteisingai nurodytos valstybinio socialinio draudimo įmokos", Array(FormFields.ItemByName("ChargedMonthly")), EL_ERROR
		end if
		if (M3 > P205 + P215 + 1) then
			form.setError "Neteisingai nurodytos valstybinio socialinio draudimo įmokos", Array(FormFields.ItemByName("ChargedMonthly")), EL_ERROR
		end if
	end if
	if Cstr(formFields.ItemByName("UncountedTransfer").value) = "  " then
		Call formFields.ItemByName("UncountedTransfer").SetCheckValue(Form.FormatDecimal(0))
	end if
End Function

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
Option Explicit

dim ReasonList
dim ReasonListDet
dim ReasonListDet0506
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
'Call Init
' This function starts execution of the script
Sub Main()
	dim formFields
	dim criticalError, ProfK
	Call ResetReasonOnMain
	criticalError = false
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	Call SetPageNumbers(FormDefs)
	Call CopyFieldsFromParent(FormDefs(0), FormDefs(1), Array("InsurerCode","DocDate","DocNumber"))
	Call ValidateHeader(formFields)
	Call ValidateFooter(formFields)
	
	if not criticalError then
		Call RecalcBody
	end if
	'Init
	
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
			If Kodas <> "" Then
				if Not Prof_Kodas.Exists(Kodas) Then
					Form.SetError "Nurodytas profesijos kodas neegzistuoja profesijų sąraše "&PageNum&" lapo "&RowNum&" eilutėje", array(FormFields.ItemByName("PersonProfession_1_"&RowNum), FormFields.ItemByName("PersonProfession_2_"&RowNum),FormFields.ItemByName("PersonProfession_3_"&RowNum), FormFields.ItemByName("PersonProfession_4_"&RowNum))
				end if
			end if
		Else
			Form.SetError "Nenurodytas asmens profesijos kodas "&PageNum&" lapo "&RowNum&" eilutėje", array(FormFields.ItemByName("PersonProfession_1_"&RowNum), FormFields.ItemByName("PersonProfession_2_"&RowNum),FormFields.ItemByName("PersonProfession_3_"&RowNum), FormFields.ItemByName("PersonProfession_4_"&RowNum))
		end if
	else
		if fld1.value <> "" or fld2.value <> "" or fld3.value <> "" or fld4.value <> "" then
	        	Form.SetError "Asmens profesijos kodas pildomas, kai pranešimo pateikimo priežastys - 01, 03, 05, 06, 07, 08, 14, 15, 19, 96 ir 99 "&PageNum&" lapo "&RowNum&" eilutėje", array(FormFields.ItemByName("PersonProfession_1_"&RowNum), FormFields.ItemByName("PersonProfession_2_"&RowNum),FormFields.ItemByName("PersonProfession_3_"&RowNum), FormFields.ItemByName("PersonProfession_4_"&RowNum))
	  	end if	
	end if		
end sub								
		
Function Prof_KodaiB
	Dim Pav
	Set Pav = CreateObject("Scripting.Dictionary")
		
	'Pav.Add"0110","Ginkluotųjų pajėgų karininkai, generolai ir admirolai"
	'Pav.Add"0210","Ginkluotųjų pajėgų puskarininkiai, seržantai ir viršilos"
	'Pav.Add"0310","Ginkluotųjų pajėgų profesijos, kiti laipsniai"
	Pav.Add"1111","Teisės aktų leidėjai"
	Pav.Add"1112","Vyresnieji valstybės tarnautojai"
	Pav.Add"1113","Seniūnai"
	Pav.Add"1114","Specialios paskirties organizacijų vadovai"
	Pav.Add"1120","Įmonių, įstaigų ir organizacijų vadovai"
	Pav.Add"1211","Finansų srities vadovai"
	Pav.Add"1212","Žmogiškųjų išteklių srities vadovai"
	Pav.Add"1213","Politikos ir planavimo srities vadovai"
	Pav.Add"1219","Kitur nepriskirti verslo paslaugų srities ir administracijos vadovai"
	Pav.Add"1221","Pardavimo ir rinkodaros vadovai"
	Pav.Add"1222","Reklamos ir viešųjų ryšių srities vadovai"
	Pav.Add"1223","Mokslinių tyrimų ir plėtros vadovai"
	Pav.Add"1311","Žemės ir miškų ūkio produkcijos gamybos vadovai"
	Pav.Add"1312","Akvakultūros ir žuvininkystės ūkio produkcijos gamybos vadovai"
	Pav.Add"1321","Gamybos vadovai"
	Pav.Add"1322","Gavybos vadovai"
	Pav.Add"1323","Statybos vadovai"
	Pav.Add"1324","Tiekimo, platinimo ir panašių paslaugų vadovai"
	Pav.Add"1330","Informacinių technologijų ir ryšių paslaugų srities vadovai"
	Pav.Add"1341","Vaikų priežiūros paslaugų srities vadovai"
	Pav.Add"1342","Sveikatinimo paslaugų srities vadovai"
	Pav.Add"1343","Pagyvenusių žmonių slaugos ir socialinių paslaugų srities vadovai"
	Pav.Add"1344","Socialinės paramos vadovai"
	Pav.Add"1345","Švietimo srities vadovai"
	Pav.Add"1346","Finansinių ir draudimo paslaugų padalinių vadovai"
	Pav.Add"1349","Kitur nepriskirti profesionaliųjų paslaugų srities vadovai"
	Pav.Add"1411","Viešbučių vadovai"
	Pav.Add"1412","Restoranų vadovai"
	Pav.Add"1420","Mažmeninės ir didmeninės prekybos vadovai"
	Pav.Add"1431","Sporto, laisvalaikio ir kultūros įstaigų vadovai"
	Pav.Add"1439","Kitur nepriskirti paslaugų srities vadovai"
	Pav.Add"2111","Fizikai ir astronomai"
	Pav.Add"2112","Meteorologai"
	Pav.Add"2113","Chemikai"
	Pav.Add"2114","Geologai ir geofizikai"
	Pav.Add"2120","Matematikai, aktuarai ir statistikai"
	Pav.Add"2131","Biologai, botanikai, zoologai ir giminiškų profesijų specialistai"
	Pav.Add"2132","Žemės ir miškų ūkio bei žuvininkystės specialistai"
	Pav.Add"2133","Aplinkos apsaugos specialistai"
	Pav.Add"2141","Technologijų ir gamybos inžinieriai"
	Pav.Add"2142","Statybos inžinieriai"
	Pav.Add"2143","Ekologijos inžinieriai"
	Pav.Add"2144","Mechanikos inžinieriai"
	Pav.Add"2145","Chemijos inžinieriai"
	Pav.Add"2146","Gavybos inžinieriai, metalurgai ir giminiškų profesijų specialistai"
	Pav.Add"2149","Kitur nepriskirti inžinerijos specialistai"
	Pav.Add"2151","Elektros inžinieriai"
	Pav.Add"2152","Elektronikos inžinieriai"
	Pav.Add"2153","Telekomunikacijų inžinieriai"
	Pav.Add"2161","Statybos architektai"
	Pav.Add"2162","Kraštovaizdžio architektai"
	Pav.Add"2163","Produktų ir drabužių dizaineriai"
	Pav.Add"2164","Miestų ir kelių eismo planuotojai"
	Pav.Add"2165","Kartografai ir topografai"
	Pav.Add"2166","Grafikos ir multimedijos dizaineriai"
	Pav.Add"2211","Bendrosios praktikos gydytojai"
	Pav.Add"2212","Gydytojai specialistai"
	Pav.Add"2221","Slaugos specialistai"
	Pav.Add"2222","Akušerijos specialistai"
	Pav.Add"2230","Tradicinės ir liaudies medicinos specialistai"
	Pav.Add"2240","Paramedikai"
	Pav.Add"2250","Veterinarai"
	Pav.Add"2261","Gydytojai odontologai"
	Pav.Add"2262","Vaistininkai"
	Pav.Add"2263","Aplinkos, profesinės sveikatos ir higienos specialistai"
	Pav.Add"2264","Fizioterapeutai"
	Pav.Add"2265","Dietistai ir mitybos specialistai"
	Pav.Add"2266","Audiologai ir kalbos terapeutai"
	Pav.Add"2267","Optometrijos specialistai ir optikai"
	Pav.Add"2269","Kitur nepriskirti sveikatos specialistai"
	Pav.Add"2310","Aukštųjų mokyklų dėstytojai"
	Pav.Add"2320","Profesijos mokytojai"
	Pav.Add"2330","Pagrindinio ir vidurinio ugdymo mokytojai"
	Pav.Add"2341","Pradinio ugdymo mokytojai"
	Pav.Add"2342","Ikimokyklinio ugdymo mokytojai"
	Pav.Add"2351","Švietimo metodų specialistai"
	Pav.Add"2352","Specialiųjų poreikių mokinių mokytojai"
	Pav.Add"2353","Neformaliojo švietimo kalbų mokytojai"
	Pav.Add"2354","Neformaliojo švietimo muzikos mokytojai"
	Pav.Add"2355","Neformaliojo švietimo meninio ugdymo mokytojai"
	Pav.Add"2356","Neformaliojo švietimo informacinių technologijų praktikos mokytojai"
	Pav.Add"2359","Kitur nepriskirti mokymo specialistai"
	Pav.Add"2411","Buhalteriai"
	Pav.Add"2412","Finansų ir investicijų konsultantai"
	Pav.Add"2413","Finansų analitikai"
	Pav.Add"2421","Vadybos ir organizavimo analitikai"
	Pav.Add"2422","Politikos ir administravimo specialistai"
	Pav.Add"2423","Personalo ir profesinio orientavimo specialistai"
	Pav.Add"2424","Mokymo ir darbuotojų ugdymo specialistai"
	Pav.Add"2431","Reklamos ir rinkodaros specialistai"
	Pav.Add"2432","Viešųjų ryšių specialistai"
	Pav.Add"2433","Technikos ir medicinos sričių pardavimo (išskyrus informacinių technologijų ir ryšių paslaugų pardavimą) specialistai "
	Pav.Add"2434","Informacinių technologijų ir ryšių paslaugų pardavimo specialistai"
	Pav.Add"2511","Sistemų analitikai"
	Pav.Add"2512","Programinės įrangos kūrėjai"
	Pav.Add"2513","Saityno ir multimedijos kūrėjai"
	Pav.Add"2514","Taikomųjų programų kūrėjai"
	Pav.Add"2519","Kitur nepriskirti programinės įrangos ir taikomųjų programų kūrėjai ir analitikai"
	Pav.Add"2521","Duomenų bazių projektuotojai ir administratoriai"
	Pav.Add"2522","Sistemų administratoriai"
	Pav.Add"2523","Kompiuterių tinklų specialistai"
	Pav.Add"2529","Kitur nepriskirti duomenų bazių ir tinklų specialistai"
	Pav.Add"2611","Teisininkai"
	Pav.Add"2612","Teisėjai"
	Pav.Add"2619","Kitur nepriskirti teisės specialistai"
	Pav.Add"2621","Archyvų ir muziejų specialistai"
	Pav.Add"2622","Bibliotekininkai ir kiti informacijos specialistai"
	Pav.Add"2631","Ekonomistai"
	Pav.Add"2632","Sociologai, antropologai ir giminiškų profesijų specialistai"
	Pav.Add"2633","Filosofai, istorikai ir politologai"
	Pav.Add"2634","Psichologai"
	Pav.Add"2635","Socialiniai darbuotojai ir konsultantai"
	Pav.Add"2636","Religijų specialistai"
	Pav.Add"2641","Autoriai ir kiti rašytojai"
	Pav.Add"2642","Žurnalistai"
	Pav.Add"2643","Vertėjai ir kalbininkai"
	Pav.Add"2651","Regimojo meno kūrėjai ir atlikėjai"
	Pav.Add"2652","Muzikantai, dainininkai ir kompozitoriai"
	Pav.Add"2653","Šokėjai ir choreografai"
	Pav.Add"2654","Kino, teatro ir panašių sričių režisieriai ir prodiuseriai"
	Pav.Add"2655","Aktoriai"
	Pav.Add"2656","Radijo, televizijos ir kitų informacijos sklaidos priemonių diktoriai"
	Pav.Add"2659","Kitur nepriskirti kūrybiniai darbuotojai ir atlikėjai"
	Pav.Add"3111","Chemijos ir kitų fizinių mokslų technikai"
	Pav.Add"3112","Statybos inžinerijos technikai"
	Pav.Add"3113","Elektros inžinerijos technikai"
	Pav.Add"3114","Elektronikos inžinerijos technikai"
	Pav.Add"3115","Mechanikos inžinerijos technikai"
	Pav.Add"3116","Cheminės inžinerijos technikai"
	Pav.Add"3117","Gavybos ir metalurgijos technikai"
	Pav.Add"3118","Braižytojai"
	Pav.Add"3119","Kitur nepriskirti fizinių mokslų ir inžinerijos technikai"
	Pav.Add"3121","Gavybos darbų meistrai ir brigadininkai"
	Pav.Add"3122","Gamybos darbų meistrai ir brigadininkai"
	Pav.Add"3123","Statybos darbų meistrai ir brigadininkai"
	Pav.Add"3131","Elektrinių operatoriai"
	Pav.Add"3132","Atliekų deginimo ir vandens valymo įrenginių operatoriai"
	Pav.Add"3133","Cheminio apdorojimo įrenginių valdymo operatoriai"
	Pav.Add"3134","Naftos ir gamtinių dujų perdirbimo įrenginių operatoriai"
	Pav.Add"3135","Metalurgijos technologinių procesų valdymo įrangos operatoriai"
	Pav.Add"3139","Kitur nepriskirti technologinių procesų valdymo technikai"
	Pav.Add"3141","Gyvosios gamtos mokslų technikai (išskyrus medicinos ir patologijos laboratorijų technikus)"
	Pav.Add"3142","Žemės ūkio technikai"
	Pav.Add"3143","Jaunesnieji miškų ūkio specialistai"
	Pav.Add"3151","Laivų mechanikai"
	Pav.Add"3152","Laivavedžiai ir laivų kapitonai"
	Pav.Add"3153","Orlaivių pilotai ir kiti giminiškų profesijų specialistai"
	Pav.Add"3154","Skrydžių vadovai"
	Pav.Add"3155","Skrydžių saugos elektronikos technikai"
	Pav.Add"3211","Medicininio vizualizavimo ir medicininės įrangos technikai"
	Pav.Add"3212","Medicinos ir patologijos laboratorijų technikai"
	Pav.Add"3213","Farmacijos technikai ir vaistininkų padėjėjai"
	Pav.Add"3214","Medicinos ir dantų technikai"
	Pav.Add"3221","Jaunesnieji slaugos specialistai"
	Pav.Add"3222","Jaunesnieji akušerijos specialistai"
	Pav.Add"3230","Jaunesnieji tradicinės ir liaudies medicinos specialistai"
	Pav.Add"3240","Veterinarijos technikai ir felčeriai"
	Pav.Add"3251","Gydytojo odontologo padėjėjai ir burnos higienistai"
	Pav.Add"3252","Medicininių įrašų ir sveikatos informacijos technikai"
	Pav.Add"3253","Visuomenės sveikatos priežiūros darbuotojai"
	Pav.Add"3254","Optikai"
	Pav.Add"3255","Fizioterapijos technikai ir fizioterapeutų padėjėjai"
	Pav.Add"3256","Gydytojo padėjėjai"
	Pav.Add"3257","Aplinkos ir profesinės sveikatos inspektoriai ir darbuotojai"
	Pav.Add"3258","Skubiosios medicinos pagalbos darbuotojai"
	Pav.Add"3259","Kitur nepriskirti jaunesnieji sveikatos specialistai"
	Pav.Add"3311","Vertybinių popierių ir finansų makleriai ir brokeriai"
	Pav.Add"3312","Kreditų ir paskolų specialistai"
	Pav.Add"3313","Jaunesnieji apskaitos specialistai"
	Pav.Add"3314","Statistikai, matematikai ir jaunesnieji giminiškų profesijų specialistai"
	Pav.Add"3315","Nuostolių ir kiti vertintojai"
	Pav.Add"3321","Draudimo agentai"
	Pav.Add"3322","Pardavimo atstovai"
	Pav.Add"3323","Pirkimo specialistai"
	Pav.Add"3324","Prekybos brokeriai"
	Pav.Add"3331","Muitinės dokumentų tvarkymo ir prekių vežimo agentai"
	Pav.Add"3332","Konferencijų ir renginių planuotojai"
	Pav.Add"3333","Įdarbinimo agentai ir darbo sutarčių sudarytojai"
	Pav.Add"3334","Nekilnojamojo turto agentai ir pardavėjai"
	Pav.Add"3339","Kitur nepriskirti verslo paslaugų agentai"
	Pav.Add"3341","Vyresnieji raštinės darbuotojai"
	Pav.Add"3342","Teisės institucijų sekretoriai"
	Pav.Add"3343","Administravimo ir vykdomieji sekretoriai"
	Pav.Add"3344","Medicinos sekretoriai"
	Pav.Add"3351","Muitinės ir pasienio inspektoriai"
	Pav.Add"3352","Mokesčių tarnybų jaunesnieji specialistai"
	Pav.Add"3353","Socialinių išmokų specialistai"
	Pav.Add"3354","Licencijų išdavimo specialistai"
	Pav.Add"3355","Policijos specialistai ir tyrėjai"
	Pav.Add"3359","Kitur nepriskirti jaunesnieji valstybės tarnybų specialistai"
	Pav.Add"3411","Jaunesnieji teisės ir giminiškų profesijų specialistai"
	Pav.Add"3412","Jaunesnieji socialiniai darbuotojai"
	Pav.Add"3413","Jaunesnieji religijos profesijų specialistai"
	Pav.Add"3421","Sportininkai ir žaidėjai"
	Pav.Add"3422","Sporto treneriai, instruktoriai ir teisėjai"
	Pav.Add"3423","Kūno rengybos ir poilsio instruktoriai bei programų vadovai"
	Pav.Add"3431","Fotografai"
	Pav.Add"3432","Interjero dizaineriai ir dekoratoriai"
	Pav.Add"3433","Galerijų, muziejų ir bibliotekų technikai"
	Pav.Add"3434","Vyriausieji virėjai"
	Pav.Add"3435","Kiti jaunesnieji meno ir kultūros specialistai"
	Pav.Add"3511","Informacinių technologijų ir ryšių sistemų eksploatavimo technikai"
	Pav.Add"3512","Pagalbos informacinių technologijų ir ryšių sistemų naudotojams technikai"
	Pav.Add"3513","Kompiuterių tinklų ir sistemų technikai"
	Pav.Add"3514","Saityno technikai"
	Pav.Add"3521","Transliavimo ir garso bei vaizdo sistemų technikai"
	Pav.Add"3522","Telekomunikacijų inžinerijos technikai"
	Pav.Add"4110","Tarnautojai, atliekantys bendras funkcijas"
	Pav.Add"4120","Sekretoriai, atliekantys bendras funkcijas"
	Pav.Add"4131","Mašininkai ir tekstų tvarkybos operatoriai"
	Pav.Add"4132","Duomenų įvesties operatoriai"
	Pav.Add"4211","Bankų kasininkai ir giminiškų profesijų tarnautojai"
	Pav.Add"4212","Lažybų tarpininkai, lošimo namų tarnautojai ir panašūs lošimų tarnautojai"
	Pav.Add"4213","Lombardų tarnautojai ir pinigų skolintojai"
	Pav.Add"4214","Skolų išieškotojai ir giminiškų profesijų tarnautojai"
	Pav.Add"4221","Kelionių konsultantai ir tarnautojai"
	Pav.Add"4222","Nuotolinio klientų informavimo tarnautojai"
	Pav.Add"4223","Telefonų skirstiklių operatoriai"
	Pav.Add"4224","Viešbučių registratoriai"
	Pav.Add"4225","Atsakymų į užklausas ir informavimo tarnautojai"
	Pav.Add"4226","Klientų priėmimo tarnautojai, atliekantys bendras funkcijas"
	Pav.Add"4227","Apklausų atlikėjai"
	Pav.Add"4229","Kitur nepriskirti klientų informavimo tarnautojai"
	Pav.Add"4311","Apskaitos ir buhalterijos tarnautojai"
	Pav.Add"4312","Statistikos, finansų ir draudimo tarnautojai"
	Pav.Add"4313","Darbo užmokesčio apskaitos tarnautojai"
	Pav.Add"4321","Sandėliavimo tarnybos tarnautojai"
	Pav.Add"4322","Tiekimo tarnautojai"
	Pav.Add"4323","Transporto tarnautojai"
	Pav.Add"4411","Bibliotekų tarnautojai"
	Pav.Add"4412","Paštininkai ir giminiškų profesijų tarnautojai"
	Pav.Add"4413","Informacijos kodavimo, korektūros ir kitokios tvarkybos tarnautojai"
	Pav.Add"4414","Raštininkai ir giminiškų profesijų tarnautojai"
	Pav.Add"4415","Kartotekų ir kopijavimo tarnautojai"
	Pav.Add"4416","Darbuotojų informacijos tarnautojai"
	Pav.Add"4419","Kitur nepriskirti tarnautojai"
	Pav.Add"5111","Kelionių palydovai"
	Pav.Add"5112","Transporto priemonių konduktoriai"
	Pav.Add"5113","Kelionių vadovai"
	Pav.Add"5120","Virėjai"
	Pav.Add"5131","Padavėjai"
	Pav.Add"5132","Barmenai"
	Pav.Add"5141","Kirpėjai"
	Pav.Add"5142","Kosmetikai ir giminiškų profesijų darbuotojai"
	Pav.Add"5151","Vyresnieji biurų, viešbučių ir kitų įstaigų valymo ir bendrosios priežiūros darbuotojai"
	Pav.Add"5152","Namų ūkio ekonomai"
	Pav.Add"5153","Pastatų prižiūrėtojai"
	Pav.Add"5161","Astrologai, būrėjai ir giminiškų profesijų darbuotojai"
	Pav.Add"5162","Tarnai ir palydovai"
	Pav.Add"5163","Laidojimo paslaugų darbuotojai"
	Pav.Add"5164","Gyvūnų (augintinių) higienos ir priežiūros darbuotojai"
	Pav.Add"5165","Vairavimo instruktoriai"
	Pav.Add"5169","Kitur nepriskirti paslaugų asmenims darbuotojai"
	Pav.Add"5211","Kioskų ir turgaviečių pardavėjai"
	Pav.Add"5212","Maisto produktų gatvės pardavėjai"
	Pav.Add"5221","Krautuvininkai"
	Pav.Add"5222","Vyresnieji parduotuvių darbuotojai"
	Pav.Add"5223","Parduotuvių pardavėjai"
	Pav.Add"5230","Kasininkai ir bilietų pardavėjai"
	Pav.Add"5241","Madų ir panašūs demonstruotojai"
	Pav.Add"5242","Prekių demonstruotojai"
	Pav.Add"5243","Išnešiojamosios prekybos pardavėjai"
	Pav.Add"5244","Nuotolinės prekybos pardavėjai"
	Pav.Add"5245","Degalinių operatoriai"
	Pav.Add"5246","Maitinimo paslaugų prekystalių pardavėjai"
	Pav.Add"5249","Kitur nepriskirti pardavėjai"
	Pav.Add"5311","Vaikų priežiūros darbuotojai"
	Pav.Add"5312","Mokytojų padėjėjai"
	Pav.Add"5321","Asmens sveikatos priežiūros padėjėjai"
	Pav.Add"5322","Asmens priežiūros namuose darbuotojai"
	Pav.Add"5329","Kitur nepriskirti asmens sveikatos priežiūros darbuotojai"
	Pav.Add"5411","Ugniagesiai"
	Pav.Add"5412","Policijos pareigūnai"
	Pav.Add"5413","Įkalinimo įstaigų sargybiniai"
	Pav.Add"5414","Apsaugos darbuotojai"
	Pav.Add"5419","Kitur nepriskirti apsaugos darbuotojai"
	Pav.Add"6111","Kultūrinių lauko augalų ir daržovių augintojai"
	Pav.Add"6112","Vaismedžių ir vaiskrūmių augintojai"
	Pav.Add"6113","Sodininkai, daržininkai, medelynų ir daigynų darbuotojai"
	Pav.Add"6114","Mišriųjų kultūrinių augalų augintojai"
	Pav.Add"6121","Gyvulių augintojai"
	Pav.Add"6122","Paukščių augintojai"
	Pav.Add"6123","Bitininkai"
	Pav.Add"6129","Kitur nepriskirti gyvūnų augintojai"
	Pav.Add"6130","Kultūrinių augalų ir gyvūnų augintojai"
	Pav.Add"6210","Miškų ūkio ir giminiškų profesijų darbuotojai"
	Pav.Add"6221","Akvakultūros ūkio darbuotojai"
	Pav.Add"6222","Vidaus ir priekrantės vandenų žvejai"
	Pav.Add"6223","Giliavandenės žvejybos žvejai"
	Pav.Add"6224","Medžiotojai"
	Pav.Add"6310","Natūraliojo ūkio kultūrinių augalų augintojai"
	Pav.Add"6320","Natūraliojo ūkio gyvulių augintojai"
	Pav.Add"6330","Mišriojo natūraliojo ūkio kultūrinių augalų ir gyvulių augintojai"
	Pav.Add"6340","Natūraliojo ūkio žvejai, miško gėrybių ir vaistažolių rinkėjai"
	Pav.Add"7111","Statybininkai"
	Pav.Add"7112","Plytų mūrininkai ir giminiškų profesijų darbininkai"
	Pav.Add"7113","Akmenų mūrininkai, akmenskaldžiai, akmentašiai ir raižytojai"
	Pav.Add"7114","Betonuotojai, betono apdailininkai ir giminiškų profesijų darbininkai"
	Pav.Add"7115","Dailidės ir staliai"
	Pav.Add"7119","Kitur nepriskirti statybininkai montuotojai ir giminiškų profesijų darbininkai"
	Pav.Add"7121","Stogdengiai"
	Pav.Add"7122","Grindų ir plytelių klojėjai"
	Pav.Add"7123","Tinkuotojai"
	Pav.Add"7124","Darbininkai izoliuotojai"
	Pav.Add"7125","Stikliai"
	Pav.Add"7126","Vandentiekininkai ir vamzdynų montuotojai"
	Pav.Add"7127","Oro kondicionavimo ir šaldymo įrenginių mechanikai"
	Pav.Add"7131","Dažytojai ir giminiškų profesijų darbininkai"
	Pav.Add"7132","Dažytojai purškėjai ir lakuotojai"
	Pav.Add"7133","Statybinių konstrukcijų valytojai"
	Pav.Add"7211","Metalo liejikai ir liejimo formų gamintojai"
	Pav.Add"7212","Suvirintojai"
	Pav.Add"7213","Skardininkai"
	Pav.Add"7214","Metalinių konstrukcijų ruošėjai ir montuotojai"
	Pav.Add"7215","Takelažininkai ir lynų sujungėjai"
	Pav.Add"7221","Kalviai, štampuotojai ir kalimo presų operatoriai"
	Pav.Add"7222","Įrankininkai ir giminiškų profesijų darbininkai"
	Pav.Add"7223","Metalo apdirbimo staklių derintojai ir operatoriai"
	Pav.Add"7224","Metalo poliruotojai, šlifuotojai ir įrankių galąstojai"
	Pav.Add"7231","Variklinių transporto priemonių mechanikai ir taisytojai"
	Pav.Add"7232","Orlaivių variklių mechanikai ir taisytojai"
	Pav.Add"7233","Pramonės ir žemės ūkio mašinų mechanikai ir taisytojai"
	Pav.Add"7234","Dviračių ir panašių mechanizmų taisytojai"
	Pav.Add"7311","Tiksliųjų prietaisų ir įrankių gamintojai ir taisytojai"
	Pav.Add"7312","Muzikos instrumentų gamintojai ir derintojai"
	Pav.Add"7313","Juvelyrai ir tauriųjų metalų apdirbėjai"
	Pav.Add"7314","Keramikai, puodžiai ir giminiškų profesijų darbininkai"
	Pav.Add"7315","Stiklo dirbinių meistrai, pjaustytojai ir šlifuotojai"
	Pav.Add"7316","Ženklų piešėjai, dekoruotojai, graviruotojai ir ėsdintojai"
	Pav.Add"7317","Amatininkai, gaminantys dirbinius iš medienos, vytelių ir panašių medžiagų"
	Pav.Add"7318","Amatininkai, gaminantys dirbinius iš tekstilės, odos ir panašių medžiagų"
	Pav.Add"7319","Kitur nepriskirti amatininkai"
	Pav.Add"7321","Spausdinimo formų surinkėjai ir ruošėjai"
	Pav.Add"7322","Spaustuvininkai"
	Pav.Add"7323","Spaudinių apdailos darbininkai ir knygrišiai"
	Pav.Add"7411","Pastatų ir kitokie elektrikai"
	Pav.Add"7412","Elektromechanikai ir elektromonteriai"
	Pav.Add"7413","Elektros linijų įrengėjai ir taisytojai"
	Pav.Add"7421","Elektroninės įrangos mechanikai ir taisytojai"
	Pav.Add"7422","Informacinių technologijų ir ryšių sistemų įrengėjai ir taisytojai"
	Pav.Add"7511","Mėsininkai, žuvų darinėtojai ir giminiškų profesijų darbininkai"
	Pav.Add"7512","Kepėjai ir konditeriai"
	Pav.Add"7513","Pieno produktų gamintojai"
	Pav.Add"7514","Vaisių, daržovių ir panašių produktų konservuotojai"
	Pav.Add"7515","Maisto produktų ir gėrimų degustatoriai ir rūšiuotojai"
	Pav.Add"7516","Tabako ruošėjai ir tabako gaminių gamintojai"
	Pav.Add"7521","Medienos meistrai"
	Pav.Add"7522","Baldžiai ir giminiškų profesijų darbininkai"
	Pav.Add"7523","Medienos apdirbimo staklių derintojai ir operatoriai"
	Pav.Add"7531","Siuvėjai, kailininkai ir kepurininkai"
	Pav.Add"7532","Drabužių ir kitų gaminių sukirpėjai"
	Pav.Add"7533","Siuvinėtojai ir giminiškų profesijų darbininkai"
	Pav.Add"7534","Baldų apmušėjai ir giminiškų profesijų darbininkai"
	Pav.Add"7535","Kailiadirbiai ir odininkai"
	Pav.Add"7536","Batsiuviai ir giminiškų profesijų darbininkai"
	Pav.Add"7541","Narai"
	Pav.Add"7542","Sprogdintojai"
	Pav.Add"7543","Produktų rūšiuotojai ir bandytojai (išskyrus maisto produktų ir gėrimų degustatorius ir rūšiuotojus)"
	Pav.Add"7544","Fumigaciją atliekantys darbuotojai ir kiti kenkėjų ir piktžolių naikintojai"
	Pav.Add"7549","Kitur nepriskirti kvalifikuoti darbininkai ir amatininkai"
	Pav.Add"8111","Kalnakasiai ir kasybos įrenginių operatoriai"
	Pav.Add"8112","Mineralų ir uolienų apdorojimo įrenginių operatoriai"
	Pav.Add"8113","Gręžinių gręžėjai ir giminiškų profesijų darbininkai"
	Pav.Add"8114","Cemento gamybos, akmens ir kitos mineralinės žaliavos apdirbimo mašinų operatoriai"
	Pav.Add"8121","Metalų perdirbimo ir apdorojimo įrenginių operatoriai"
	Pav.Add"8122","Metalų poliravimo, elektrolitinio ir kitokio metalų paviršiaus dengimo įrenginių operatoriai"
	Pav.Add"8131","Cheminių gaminių gamybos įrenginių ir mašinų operatoriai"
	Pav.Add"8132","Fotografijos gaminių gamybos mašinų operatoriai"
	Pav.Add"8141","Guminių gaminių gamybos mašinų operatoriai"
	Pav.Add"8142","Plastikinių gaminių gamybos mašinų operatoriai"
	Pav.Add"8143","Popierinių gaminių gamybos mašinų operatoriai"
	Pav.Add"8151","Pluošto ruošimo, verpimo ir vijimo mašinų operatoriai"
	Pav.Add"8152","Audimo ir mezgimo mašinų operatoriai"
	Pav.Add"8153","Siuvimo ir siuvinėjimo mašinų operatoriai"
	Pav.Add"8154","Balinimo, dažymo ir valymo mašinų operatoriai"
	Pav.Add"8155","Kailių ir odos išdirbimo mašinų operatoriai"
	Pav.Add"8156","Avalynės ir panašių gaminių gamybos mašinų operatoriai"
	Pav.Add"8157","Skalbimo mašinų operatoriai"
	Pav.Add"8159","Kitur nepriskirti tekstilės, kailio ir odos gaminių gamybos mašinų operatoriai"
	Pav.Add"8160","Maisto ir panašių produktų gamybos mašinų operatoriai"
	Pav.Add"8171","Popieriaus plaušienos paruošimo ir popieriaus gamybos įrenginių operatoriai"
	Pav.Add"8172","Medienos apdirbimo įrenginių operatoriai"
	Pav.Add"8181","Stiklo ir keramikos gamybos įrenginių operatoriai"
	Pav.Add"8182","Garo variklių ir katilų operatoriai"
	Pav.Add"8183","Pakavimo, pilstymo į butelius ir ženklinimo (etiketėmis) operatoriai"
	Pav.Add"8189","Kitur nepriskirti stacionariųjų įrenginių ir mašinų operatoriai"
	Pav.Add"8211","Mechaninių mašinų surinkėjai"
	Pav.Add"8212","Elektrinės ir elektroninės įrangos surinkėjai"
	Pav.Add"8219","Kitur nepriskirti surinkėjai"
	Pav.Add"8311","Lokomotyvų mašinistai"
	Pav.Add"8312","Geležinkelio ratstabdininkai, signalizuotojai ir iešmininkai"
	Pav.Add"8321","Motociklų vairuotojai"
	Pav.Add"8322","Lengvųjų automobilių, taksi ir furgonų vairuotojai"
	Pav.Add"8331","Autobusų ir troleibusų vairuotojai"
	Pav.Add"8332","Sunkiasvorių sunkvežimių ir krovinių transporto priemonių vairuotojai"
	Pav.Add"8341","Judamųjų žemės ir miškų ūkio įrenginių operatoriai"
	Pav.Add"8342","Žemės darbų ir panašių mašinų operatoriai"
	Pav.Add"8343","Kranų, kėlimo įrenginių ir panašių mašinų operatoriai"
	Pav.Add"8344","Krovininių platformų ir krautuvų operatoriai"
	Pav.Add"8350","Laivų įgulų nariai ir giminiškų profesijų darbininkai"
	Pav.Add"9111","Namų valytojai ir pagalbininkai"
	Pav.Add"9112","Biurų, viešbučių ir kitų įstaigų valytojai, kambarinės ir pagalbininkai"
	Pav.Add"9121","Skalbėjai ir lygintojai (rankomis)"
	Pav.Add"9122","Transporto priemonių plovėjai"
	Pav.Add"9123","Langų plovėjai"
	Pav.Add"9129","Kiti valytojai"
	Pav.Add"9211","Nekvalifikuoti augalininkystės ūkio darbininkai"
	Pav.Add"9212","Nekvalifikuoti gyvulininkystės ūkio darbininkai"
	Pav.Add"9213","Nekvalifikuoti mišriojo augalininkystės ir gyvulininkystės ūkio darbininkai"
	Pav.Add"9214","Nekvalifikuoti sodininkystės ir daržininkystės ūkio darbininkai"
	Pav.Add"9215","Nekvalifikuoti miškų ūkio darbininkai"
	Pav.Add"9216","Nekvalifikuoti žuvininkystės ir akvakultūros ūkio darbininkai"
	Pav.Add"9311","Nekvalifikuoti gavybos ir karjerų eksploatavimo darbininkai"
	Pav.Add"9312","Nekvalifikuoti inžinerinių statinių statybos darbininkai"
	Pav.Add"9313","Nekvalifikuoti pastatų statybos darbininkai"
	Pav.Add"9321","Pakuotojai (rankomis)"
	Pav.Add"9329","Kitur nepriskirti nekvalifikuoti apdirbimo pramonės darbininkai"
	Pav.Add"9331","Rankinių ir pedalinių transporto priemonių vairuotojai"
	Pav.Add"9332","Traukiančių transporto priemones ir mašinas gyvulių vadeliotojai"
	Pav.Add"9333","Krovikai"
	Pav.Add"9334","Prekių krovėjai į lentynas"
	Pav.Add"9411","Greitojo maisto ruošėjai"
	Pav.Add"9412","Virtuvės pagalbininkai"
	Pav.Add"9510","Gatvėje teikiamų paslaugų teikėjai"
	Pav.Add"9520","Ne maisto produktų gatvės pardavėjai"
	Pav.Add"9611","Buitinių atliekų surinkėjai"
	Pav.Add"9612","Buitinių atliekų rūšiuotojai"
	Pav.Add"9613","Kiemsargiai ir giminiškų profesijų darbininkai"
	Pav.Add"9621","Kurjeriai, pasiuntiniai ir bagažo nešikai"
	Pav.Add"9622","Nekvalifikuoti atsitiktinių darbų darbininkai"
	Pav.Add"9623","Pinigų iš automatų surinkėjai ir matuoklių rodmenų tikrintojai"
	Pav.Add"9624","Vandens vežikai ir malkų rinkėjai"
	Pav.Add"9629","Kitur nepriskirti nekvalifikuoti darbininkai"

		
	Set Prof_KodaiB = Pav

End Function	

' Paleidus forma inicijuojamas pirmo lygio profesiju sarasas visiems lapams
Sub Init
    Dim prof_list_1(8)
    Dim fields, fld1, p, i, pages
		
    set pages = form.getpagesfortemplate("1-SD-T")
    for p = 1 to pages.count
    set fields = pages.item(p).fields
    for i = 1 to 4
    Set fld1 = fields.ItemByName("PersonProfession_1_"&i)
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
			prof_list_1(8) = "9;Nekvalifikuoti darbininkai"
			fld1.AttachList prof_list_1
			Fields.itemByName("PersonProfession_1_"&i).SetCheckValue cStr(fld1.Value)	 
    end if
    next
    next		
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
		Array("19","užsienietis su viza",_
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
	
	ReasonListDet0506 = Array(_
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
	
	ReasonListDet = Array(_
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
		Array("IE","Airija",ReasonListDet0506),_
		Array("AT","Austrija",ReasonListDet0506),_
		Array("BY","Baltarusija",ReasonListDet0506),_
		Array("BE","Belgija",ReasonListDet0506),_
		Array("BG","Bulgarija",ReasonListDet0506),_
		Array("CZ","Čekija",ReasonListDet0506),_
		Array("DK","Danija",ReasonListDet0506),_
		Array("GB","Didžioji Britanija",ReasonListDet0506),_
		Array("EE","Estija",ReasonListDet0506),_
		Array("GR","Graikija",ReasonListDet0506),_
		Array("IS","Islandija",ReasonListDet0506),_
		Array("ES","Ispanija",ReasonListDet0506),_
		Array("IT","Italija",ReasonListDet0506),_
		Array("CA","Kanada",ReasonListDet0506),_
		Array("CY","Kipras",ReasonListDet0506),_
		Array("HR","Kroatija",ReasonListDet0506),_
		Array("LV","Latvija",ReasonListDet0506),_
		Array("PL","Lenkija",ReasonListDet0506),_
		Array("LI","Lichtenšteinas",ReasonListDet0506),_
		Array("LT","Lietuva",ReasonListDet0506),_
		Array("LU","Liuksemburgas",ReasonListDet0506),_
		Array("MT","Malta",ReasonListDet0506),_
		Array("NL","Nyderlandai",ReasonListDet0506),_
		Array("NO","Norvegija.",ReasonListDet0506),_
		Array("PT","Portugalija",ReasonListDet0506),_
		Array("FR","Prancūzija",ReasonListDet0506),_
		Array("RO","Rumunija",ReasonListDet0506),_
		Array("SK","Slovakija",ReasonListDet0506),_
		Array("SI","Slovėnija",ReasonListDet0506),_
		Array("FI","Suomija",ReasonListDet0506),_
		Array("SE","Švedija",ReasonListDet0506),_
		Array("CH","Šveicarija",ReasonListDet0506),_
		Array("UA","Ukraina",ReasonListDet0506),_
		Array("HU","Vengrija",ReasonListDet0506),_
		Array("DE","Vokietija",ReasonListDet0506),_
		Array("RU","Rusija",ReasonListDet0506),_
		Array("US","JAV",ReasonListDet0506)_
	)
	
	ReasonMisc = "99"
	
	'-- Other form variables --
	FormDefs = Array("1-SD","1-SD-T")
	FormVersion = "11"

	RowCountFirst = 1
	RowCountSupl = 2
	
	HeaderFieldsReq = Array("InsurerName", "InsurerAddress")
	FooterFieldsReq = Array("ManagerFullName", "PreparatorDetails")
	RowFieldsAll = Array("PersonCode_","PersonBirthDate_","InsuranceSeries_","InsuranceNumber_","InsuranceStartDate_","PersonFirstName_","PersonLastName_","ReasonCode_","ReasonText_","ReasonDetCode_","ReasonDetText_","ReasonDetTypeCode_","ReasonDetTypeText_")
	RowFieldsReq = Array("InsuranceStartDate_","PersonFirstName_","PersonLastName_","ReasonCode_")
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
	dim i, j, p, i2, j2
	dim tusciaEilute
	
	'FormVersion ir FormCode uzdejimas paspaudus TIKRINTI
	Call SetFormCodeVers(FormDefs(0), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(1), 0, FormVersion)
	
	rowCount = 0
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	
	'first page calculation
	for i = 1 to RowCountFirst
		if CompleteFieldsetAny(formFields, GetFieldNames(RowFieldsAll, i)) then
			rowCount = rowCount + 1
			Call formFields.ItemByName("RowNumber_"&i).SetCheckValue(Cstr(rowCount))
			if ValidateRow(formFields, 1, i) then
				' Row processing
			end if
		else
			Call formFields.ItemByName("RowNumber_"&i).SetCheckValue("")
			
'DT19-(08)014 --- pirmos eilutes tikrinimas, ar netuscia ------------	
			form.setError "1-SD pagrindiniame lape neužpildyta eilutė.", GetFieldObjects(formFields, Array("RowNumber_"&Cstr(i)), 0), EL_ERROR
'DT19-(08)014 -------------------------------------------------------	
	
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
	Call PazymetiTuscius(FormDefs(1), "1-SD-T", pageCount, RowCountSupl, RowFieldsAll)
	
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
	dim rsnCode, ProfK, FormField, RsnCodeDet, RsnCodeTypeDet
	set ProfK = Prof_kodaiB()
	ValidateRow = false
	If Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReq, RowNum), False) then
		form.setError "Neįvesti būtini apdraustojo duomenys "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq, RowNum), EL_ERROR
		Exit Function
	end if
	
	RowFieldsReq_2 = Array("InsuranceSeries_", "InsuranceNumber_", "PersonCode_")
	
	'Patikrinam del asmens kodo ir SD numerio pildymo
	 if ((FormFields.ItemByName("InsuranceSeries_"&RowNum).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value = "" and FormFields.ItemByName("PersonCode_"&RowNum).value = "") then
		form.setError "Nekorektiškas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq_2, RowNum), EL_ERROR
	 end if
	
	'If formFields.ItemByName("InsuranceStartDate_"&RowNum).value <> "" then
	'	if DateValue(formFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2013-11-01") and Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReq_2, RowNum), False) then
	'		form.setError "Neįvesti būtini nauji apdraustojo duomenys PT-1-SD priede", GetFieldObjects(FormFields, RowFieldsReq_2, RowNum), EL_ERROR
	'		Exit Function
	'	end if
	'	if DateValue(formFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) < DateValue("2013-11-01") then
	'		if FormFields.ItemByName("PersonProfession_1_"&RowNum).value <>"" or FormFields.ItemByName("PersonProfession_2_"&RowNum).value <>"" or FormFields.ItemByName("PersonProfession_3_"&RowNum).value <>"" or FormFields.ItemByName("PersonProfession_4_"&RowNum).value <>"" then 
	'		form.setError "Tikslinti apdraustojo asmens profesiją galima tik asmenims įdarbintiems nuo 2013-11-01", Array(FormFields.ItemByName("PersonProfession_1_"&RowNum),FormFields.ItemByName("PersonProfession_2_"&RowNum),FormFields.ItemByName("PersonProfession_3_"&RowNum),FormFields.ItemByName("PersonProfession_4_"&RowNum)), EL_WARNING
	'		Call formFields.ItemByName("PersonProfession_1_"&RowNum).SetCheckValue("")
	'		Call formFields.ItemByName("PersonProfession_2_"&RowNum).SetCheckValue("")
	'		Call formFields.ItemByName("PersonProfession_3_"&RowNum).SetCheckValue("")
	'		Call formFields.ItemByName("PersonProfession_4_"&RowNum).SetCheckValue("")
	'		'Exit Function
	'		end if
	'	end if
	'End If
	
	if Not (FormFields.ItemByName("PersonCode_"&RowNum).value = "") then
		If not validatePersonCode(FormFields.ItemByName("PersonCode_"&RowNum)) Then Exit Function
	end if
	
	rsnCode = FormFields.ItemByName("ReasonCode_"&RowNum).value
	RsnCodeDet = FormFields.ItemByName("ReasonDetCode_"&RowNum).value
	
	if not ValidateReason(FormFields, PageNum, RowNum, rsnCode, RsnCodeDet) then Exit Function
	
	Call check_prf_code(ProfK, FormFields, PageNum, RowNum)
	
  if FormFields.ItemByName("U1Group_"&RowNum).value <> "-1" then
	  if FormFields.ItemByName("U1Group_"&RowNum).value = 1 then
		  if FormFields.ItemByName("PersonBirthDate_"&RowNum).value <> "" then 
				form.setError "Jeigu pažymėtas U1.1 laukas, tai A2.1 laukas turi būti neužpildytas "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("U1Group_","PersonBirthDate_"), RowNum), EL_ERROR
				Exit Function
			end if
		elseif FormFields.ItemByName("U1Group_"&RowNum).value = 2 then
			if FormFields.ItemByName("PersonBirthDate_"&RowNum).value = "" then 
				form.setError "Jeigu pažymėtas U1.2 laukas, tai A2.1 laukas turi būti užpildytas "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("U1Group_","PersonBirthDate_"), RowNum), EL_ERROR
				Exit Function
			end if
		end if
	elseif FormFields.ItemByName("U1Group_"&RowNum).value = "-1" then
		form.setError "Laukas turi būti užpildytas "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("U1Group_"), RowNum), EL_ERROR
		Exit Function
	end if
	
	if FormFields.ItemByName("PersonForeignCode_"&RowNum).value <> "" then
		if len(FormFields.ItemByName("PersonForeignCode_"&RowNum).value) < 11 then
			form.setError "Asmens užsieniečio kodo ilgis turi būti 11 skaitmenų "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("PersonForeignCode_"), RowNum), EL_ERROR
			Exit Function
		end if
		if Left(FormFields.ItemByName("PersonForeignCode_"&RowNum).value,1) <> "9" then
			form.setError "Asmens užsieniečio kodo pirmasis simbolis turi būti skaičius 9 "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("PersonForeignCode_"), RowNum), EL_ERROR
			Exit Function
		end if
	end if
		
	ValidateRow = true
End function

Function ValidateReason(FormFields, PageNum, RowNum, RsnCode, RsnCodeDet)
	dim rsnText
	dim rsnTextExist
	dim rsnDetText
	dim rsnDetTypeText
	
	ValidateReason = false
	
	if RsnCode = "05" or RsnCode = "06" or ((RsnCode = "01" or RsnCode = "19" or RsnCode = "96") and DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2017-07-01")) or ((RsnCode = "14" or RsnCode = "22") and DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2019-01-01")) then
		rsnDetText = ucase(GetReasonDetTextByCode(RsnCode, FormFields.ItemByName("ReasonDetCode_"&RowNum).value))
		if not (ucase(FormFields.ItemByName("ReasonDetText_"&RowNum).value) = rsnDetText) then
			FormFields.ItemByName("ReasonDetText_"&RowNum).SetCheckValue(rsnDetText)
		end if
	end if
	
	if (RsnCodeDet = "03" or RsnCodeDet = "06" or RsnCodeDet = "07" or RsnCodeDet = "08") and DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2017-07-01") then
		rsnDetTypeText = ucase(GetReasonDetTypeTextByCode(RsnCodeDet, FormFields.ItemByName("ReasonDetTypeCode_"&RowNum).value))
		if not (ucase(FormFields.ItemByName("ReasonDetTypeText_"&RowNum).value) = rsnDetTypeText) then
			FormFields.ItemByName("ReasonDetTypeText_"&RowNum).SetCheckValue(rsnDetTypeText)
		end if
	end if
	
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

  if RsnCode = "14" or RsnCode = "22" then 
		if DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2019-01-01") then
			If Not CompleteFieldSet(FormFields, GetFieldNames(Array("ReasonDetCode_","ReasonDetText_"), RowNum), False) then
				form.setError "Nenurodytas pranešimo pateikimo priežasties patikslinimas "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonDetCode_","ReasonDetText_"), RowNum), EL_ERROR
				Exit Function
			end if
		else
			if CompleteFieldSetAny(FormFields, GetFieldNames(Array("ReasonDetCode_","ReasonDetText_"), RowNum)) then
				form.setError "Nurodytai pranešimo pateikimo priežasčiai patikslinimo nurodyti nereikia iki 2018-12-31 "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonDetCode_","ReasonDetText_"), RowNum), EL_ERROR
				Exit Function
			end if
		end if
	else
		if rsnCode = "05" or rsnCode = "06" or rsnCode = "10" or rsnCode = "11" or ((RsnCode = "01" or RsnCode = "19" or RsnCode = "96") and DateValue(FormFields.ItemByName("InsuranceStartDate_"&RowNum).toDate) >= DateValue("2017-07-01")) then
			If Not CompleteFieldSet(FormFields, GetFieldNames(Array("ReasonDetCode_","ReasonDetText_"), RowNum), False) then
				form.setError "Nenurodytas pranešimo pateikimo priežasties patikslinimas "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonDetCode_","ReasonDetText_"), RowNum), EL_ERROR
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
		Call form.SetOnChangedHandlerEx("OnChangeRD", Cstr(FormDefs(0)), "ReasonDetCode_"&Cstr(i))
		Call form.SetOnChangedHandlerEx("OnChangeRDT", Cstr(FormDefs(0)), "ReasonDetTypeCode_"&Cstr(i))
	next

	for i = 1 to RowCountSupl
		Call form.SetOnChangedHandlerEx("OnChangeR", Cstr(FormDefs(1)), "ReasonCode_"&Cstr(i))
		Call form.SetOnChangedHandlerEx("OnChangeRD", Cstr(FormDefs(1)), "ReasonDetCode_"&Cstr(i))
		Call form.SetOnChangedHandlerEx("OnChangeRDT", Cstr(FormDefs(1)), "ReasonDetTypeCode_"&Cstr(i))
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
	Call formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).AttachList(GetReasonDetList(selectedCode))
	Call formFields.ItemByName("ReasonDetText_"&Cstr(FieldIndex)).SetCheckValue("")
	Call formFields.ItemByName("ReasonDetTypeCode_"&Cstr(FieldIndex)).SetCheckValue("")
	Call formFields.ItemByName("ReasonDetTypeText_"&Cstr(FieldIndex)).SetCheckValue("")
End Sub

Sub OnChangeRD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode, selectedDetCode, selectedDetText
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
	selectedDetCode = formFields.ItemByName("ReasonDetCode_"&Cstr(FieldIndex)).Value
	selectedDetText = GetReasonDetTextByCode(selectedCode, selectedDetCode)
	if not (selectedDetText = "") then
		Call formFields.ItemByName("ReasonDetText_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedDetText))
	end if
	Call formFields.itemByName("ReasonDetTypeCode_"&Cstr(FieldIndex)).AttachList(GetReasonDetTypeList(selectedDetCode))
	Call formFields.ItemByName("ReasonDetTypeText_"&Cstr(FieldIndex)).SetCheckValue("")
End Sub

Sub OnChangeRDT(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode, selectedDetCode, selectedDetText
	dim FieldIndex

	FieldIndex = Right(FieldName, Len(FieldName) - InStr(FieldName, "_"))
	set pages = Form.GetPagesForTemplate(PageName)
	set formFields = pages.Item(PageIndex).Fields
	selectedCode = formFields.ItemByName("ReasonDetCode_"&Cstr(FieldIndex)).Value 
	selectedDetCode = formFields.ItemByName("ReasonDetTypeCode_"&Cstr(FieldIndex)).Value
	selectedDetText = GetReasonDetTypeTextByCode(selectedCode, selectedDetCode)
	if not (selectedDetText = "") then
		Call formFields.ItemByName("ReasonDetTypeText_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedDetText))
	end if
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
	dim selectedCodeDet
	dim selectedCodeDetType
	dim i

	set pages = Form.GetPagesForTemplate(PageDefName)
	for i = 1 to pages.Count
		set formFields = pages.Item(i).Fields
		selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
		if not selectedCode = ReasonMisc then Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode(selectedCode))
		selectedCodeDet = formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).value
		Call formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).AttachList(GetReasonDetList(selectedCode))
		Call formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedCodeDet))
		
		selectedCodeDetType = formFields.itemByName("ReasonDetTypeCode_"&Cstr(FieldIndex)).value
		Call formFields.itemByName("ReasonDetTypeCode_"&Cstr(FieldIndex)).AttachList(GetReasonDetTypeList(selectedCodeDet))
		Call formFields.itemByName("ReasonDetTypeCode_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedCodeDetType))
		'Call formFields.ItemByName("ReasonDetText_"&Cstr(FieldIndex)).SetCheckValue("")
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

Function GetReasonTypeTextByCode(ReasonCodeDet)
	dim i

	for i=0 to UBound(ReasonListDet)
		if ReasonListDet(i)(0) = ReasonCodeDet then
			GetReasonTypeTextByCode = ReasonListDet(i)(1)
			Exit Function
		end if
	next

	GetReasonTypeTextByCode = ""
End Function

Function GetReasonDetTextByCode(ReasonCode, ReasonDetCode)
	dim i, j

	for i=0 to UBound(ReasonList)
		if ReasonList(i)(0) = ReasonCode then
			for j=0 to UBound(ReasonList(i)(2))
				if ReasonList(i)(2)(j)(0) = ReasonDetCode then
					GetReasonDetTextByCode = ReasonList(i)(2)(j)(1)
					Exit Function
				end if
			next
		end if
	next

	GetReasonDetTextByCode = ""
End Function

Function GetReasonDetTypeTextByCode(ReasonCodeDet, ReasonDetTypeCode)
	dim i, j

	for i=0 to UBound(ReasonListDet)
		if ReasonListDet(i)(0) = ReasonCodeDet then
			for j=0 to UBound(ReasonListDet(i)(2))
				if ReasonListDet(i)(2)(j)(0) = ReasonDetTypeCode then
					GetReasonDetTypeTextByCode = ReasonListDet(i)(2)(j)(1)
					Exit Function
				end if
			next
		end if
	next

	GetReasonDetTypeTextByCode = ""
End Function

Function GetReasonDetList(ReasonCode)
	dim lstLine
	dim i, j

	for i=0 to UBound(ReasonList)
		if ReasonList(i)(0) = ReasonCode then
			for j=0 to UBound(ReasonList(i)(2))
				if not lstLine = "" then lstLine = lstLine & "###"
				lstLine = lstLine & ReasonList(i)(2)(j)(0)&";"&ReasonList(i)(2)(j)(1)
			next
			GetReasonDetList = split(lstLine, "###")
			Exit Function
		end if
	next

	GetReasonDetList = Array("")
End Function

Function GetReasonDetTypeList(ReasonCodeDet)
	dim lstLine
	dim i, j

	for i=0 to UBound(ReasonListDet)
		if ReasonListDet(i)(0) = ReasonCodeDet then
			for j=0 to UBound(ReasonListDet(i)(2))
				if not lstLine = "" then lstLine = lstLine & "###"
				lstLine = lstLine & ReasonListDet(i)(2)(j)(0)&";"&ReasonListDet(i)(2)(j)(1)
			next
			GetReasonDetTypeList = split(lstLine, "###")
			Exit Function
		end if
	next

	GetReasonDetTypeList = Array("")
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
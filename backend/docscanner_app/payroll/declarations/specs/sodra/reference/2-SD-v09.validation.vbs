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
	
	if not criticalError then
		Call RecalcBody
	end if
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
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas")_
									)_
								),_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas")_
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
						),_
						Array("300","straipsnis",_
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
								Array("2","dalis",Array()),_
								Array("4","dalis",Array())_
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
								),_
								Array("5","dalis",Array())_
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
				Array("K35","Akcinių bendrovių įstatymas",_
					Array(_
						Array("37","straipsnis",_
							Array(_
								Array("4","dalis",Array())_
							)_
						)_
					)_
				),_
				Array("K36","LR vadovybės apsaugos įstatymas",_
					Array(_
						Array("16","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("-","punktas")_
									)_
								),_
								Array("3","dalis",_
									Array(_
										Array("-","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K37","LR žvalgybos įstatymas",_
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
										Array("17","punktas")_
									)_
								)_
							)_
						),_
						Array("54","straipsnis",_
							Array(_
								Array("7","dalis",_
									Array(_
										Array("-","punktas")_
									)_
								)_
							)_
						),_
						Array("55","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("-","punktas")_
									)_
								)_
							)_
						),_
						Array("56","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("-","punktas")_
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
								Array("1","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas")_
									)_
								),_
								Array("-","dalis",_
									Array(_
										Array("1","punktas"),_
										Array("2","punktas"),_
										Array("3","punktas"),_
										Array("4","punktas")_
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
						),_
						Array("300","straipsnis",_
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
								Array("2","dalis",Array()),_
								Array("4","dalis",Array())_
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
								),_
								Array("5","dalis",Array())_
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
				Array("K36","LR vadovybės apsaugos įstatymas",_
					Array(_
						Array("16","straipsnis",_
							Array(_
								Array("1","dalis",_
									Array(_
										Array("-","punktas")_
									)_
								),_
								Array("3","dalis",_
									Array(_
										Array("-","punktas")_
									)_
								)_
							)_
						)_
					)_
				),_
				Array("K37","LR žvalgybos įstatymas",_
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
										Array("17","punktas")_
									)_
								)_
							)_
						),_
						Array("54","straipsnis",_
							Array(_
								Array("7","dalis",_
									Array(_
										Array("-","punktas")_
									)_
								)_
							)_
						),_
						Array("55","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("-","punktas")_
									)_
								)_
							)_
						),_
						Array("56","straipsnis",_
							Array(_
								Array("-","dalis",_
									Array(_
										Array("-","punktas")_
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
		Array("20","kariūnas",Array()),_
		Array("21","eina narystės pagrindu renkamąsias/skiriamąsias pareigas",Array()),_
		Array("22","įgyta teisė nemokėti PSD įmokų arba nustatyta prievolė mokėti PSD",Array()),_
		Array("23","rinkimų ar referendumų komisijų nariai nuo 2022-01-01",Array()),_
		Array("96","darbo sutarties rūšies priskyrimas/pakeitimas",Array())_
	)
	ReasonMisc = "99"

	'-- Other form variables --
	FormDefs = Array("2-SD","2-SD-T")
	FormVersion = "09"

	RowCountFirst = 1
	RowCountSupl = 3
	
	HeaderFieldsReq = Array("InsurerName", "InsurerAddress")
	FooterFieldsReq = Array("ManagerFullName", "PreparatorDetails")
	RowFieldsAll = Array("PersonCode_","InsuranceSeries_","InsuranceNumber_","InsuranceEndDate_","PersonFirstName_","PersonLastName_","ReasonCode_","ReasonText_","ReasonDetCode_","ReasonDetText_","InsIncomeSum_","TaxRate_")
	RowFieldsReq = Array("InsuranceEndDate_","PersonFirstName_","PersonLastName_","ReasonCode_")
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
	dim formFields
	dim pageCount, rowCount
	dim i, j, p
	dim insIncomeTotal, paymentTotal, insIncomePage, paymentPage

	Call SetFormCodeVers(FormDefs(0), 0, FormVersion)
	Call SetFormCodeVers(FormDefs(1), 0, FormVersion)
			
	rowCount = 0
	insIncomeTotal = 0
	paymentTotal = 0
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	
	'first page calculation
	for i = 1 to RowCountFirst
		if CompleteFieldsetAny(formFields, GetFieldNames(RowFieldsAll, i)) then
			rowCount = rowCount + 1
			Call formFields.ItemByName("RowNumber_"&i).SetCheckValue(Cstr(rowCount))
			if ValidateRow(formFields, 1, i) then
				if RecalcRowPayment(formFields, i) then
					insIncomeTotal = insIncomeTotal + FormFields.ItemByName("InsIncomeSum_"&Cstr(i)).toDecimal
					paymentTotal = paymentTotal + FormFields.ItemByName("PaymentSum_"&Cstr(i)).toDecimal
				end if
			end if
		else
			Call formFields.ItemByName("RowNumber_"&i).SetCheckValue("")
		end if
	next
	
	'supplementary page calculation
	pageCount = ACount(FormDefs(1))
	for j = 1 to pageCount
		insIncomePage = 0
		paymentPage = 0
		p = 0
		set formFields = form.getpagesForTemplate(FormDefs(1)).Item(j).fields
		for i = 1 to RowCountSupl
			if CompleteFieldsetAny(formFields, GetFieldNames(RowFieldsAll, i)) then
				rowCount = rowCount + 1
				p = p + 1
				formFields.ItemByName("RowNumber_"&i).SetCheckValue Cstr(rowCount)
				if ValidateRow(formFields, j+1, i) then
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
			form.setError "Neužpildytas "&Cstr(j+1)&" lapas. Jei jis nereikalingas, pašalinkite jį.", GetFieldObjects(formFields, Array("FormCode"), 0), EL_ERROR
		end if
	next
	
	'totals
	set formFields = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
	Call formFields.ItemByName("PersonCountTotal").SetCheckValue(Cstr(rowCount))
	Call formFields.ItemByName("InsIncomeTotal").SetCheckValue(Form.FormatDecimal(insIncomeTotal))
	Call formFields.ItemByName("PaymentTotal").SetCheckValue(Form.FormatDecimal(paymentTotal))
	
	if rowCount = 0 then 
		form.setError "Neįvesti nei vieno apdraustojo duomenys", GetFieldObjects(FormFields, RowFieldsReq, 1), EL_ERROR
		Exit sub
	end if
End Sub

Function RecalcRowPayment(FormFields, RowNum)
	dim paymSum
	dim sumDiff
	
	RecalcRowPayment = false
	
	if FormFields.ItemByName("InsIncomeSum_"&RowNum).Value = "" then
		if not (FormFields.ItemByName("PaymentSum_"&RowNum).Value = "") then
			form.setError "Neteisingai nurodyta valstybinio socialinio draudimo įmokų suma", Array(FormFields.ItemByName("PaymentSum_"&RowNum)), EL_ERROR
		end if
		exit function
	end if
	
	if FormFields.ItemByName("InsIncomeSum_"&RowNum).toDecimal < 0 then
		form.setError "Lauke negali būti neigiama reikšmė", Array(FormFields.ItemByName("InsIncomeSum_"&RowNum)), EL_ERROR
		exit function
	else
		if FormFields.ItemByName("PaymentSum_"&RowNum).value = "" then ' skaiciujama ir uzpildoma
			FormFields.ItemByName("PaymentSum_"&RowNum).SetCheckValue(Form.FormatDecimal(FormFields.ItemByName("InsIncomeSum_"&RowNum).toDecimal*FormFields.ItemByName("TaxRate_"&RowNum).toDecimal/100))
		else ' tikrinima su leistina paklaida
'			paymSum = FormFields.ItemByName("InsIncomeSum_"&RowNum).toDecimal*TaxRate/100
'			sumDiff = paymSum - FormFields.ItemByName("PaymentSum_"&RowNum).toDecimal
'			if abs(sumDiff) > 0.03 then
'				form.setError "Neteisingai nurodyta valstybinio socialinio draudimo įmokų suma", Array(FormFields.ItemByName("PaymentSum_"&RowNum)), EL_ERROR
'				exit function
'			end if
		end if
	end if
	RecalcRowPayment = true
End Function

Function ValidateRow(FormFields, PageNum, RowNum)
	dim rsnCode, rsnDetCode
	dim insSum, EilNr
	dim formField
	dim CompM, start
	
	start = 0
	
	ValidateRow = false
	if Not CompleteFieldSet(FormFields, GetFieldNames(RowFieldsReq, RowNum), False) then
		form.setError "Neįvesti būtini apdraustojo duomenys "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq, RowNum), EL_ERROR
		Exit Function
	end if

	if Not (FormFields.ItemByName("PersonCode_"&RowNum).value = "") then
		If not validatePersonCode(FormFields.ItemByName("PersonCode_"&RowNum)) Then Exit Function
	end if
	
	'Patikrinam del asmens kodo ir SD numerio pildymo
	if ((FormFields.ItemByName("InsuranceSeries_"&RowNum).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value <> "") or (FormFields.ItemByName("InsuranceSeries_"&RowNum).value <> "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value = "")) or (FormFields.ItemByName("InsuranceSeries_"&RowNum).value = "" and FormFields.ItemByName("InsuranceNumber_"&RowNum).value = "" and FormFields.ItemByName("PersonCode_"&RowNum).value = "") then
		form.setError "Neteisingas asmens socialinio draudimo arba asmens kodo numeris "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, RowFieldsReq_2, RowNum), EL_ERROR
	end if
			
	rsnCode = FormFields.ItemByName("ReasonCode_"&RowNum).value
	if not ValidateReason(FormFields, PageNum, RowNum, rsnCode) then Exit Function
	
	if rsnCode = "10" or rsnCode = "11" or rsnCode = "12" or rsnCode = "13" or rsnCode = "17" or rsnCode = "18" or rsnCode = "20" then
		FormFields.ItemByName("InsIncomeSum_"&RowNum).SetCheckValue("")
		FormFields.ItemByName("TaxRate_"&RowNum).SetCheckValue("")
		FormFields.ItemByName("PaymentSum_"&RowNum).SetCheckValue("")
	end if
	
	if not (rsnCode = "10" or rsnCode = "11" or rsnCode = "12" or rsnCode = "13") then
		if not (rsnCode = "17" or rsnCode = "18" or rsnCode = "20") then 
			if FormFields.ItemByName("InsIncomeSum_"&RowNum).value = "" then
				form.setError "Neįvesti būtini apdraustojo duomenys "&PageNum&" lapo "&RowNum&" eilutėje", Array(FormFields.ItemByName("InsIncomeSum_"&RowNum)), EL_ERROR
				Exit Function
			end if
			Call ValidateTaxes(FormFields, PageNum, RowNum)
		else
			set formField = form.getpagesForTemplate(FormDefs(0)).Item(1).fields
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
	else
		insSum = FormFields.itemByName("InsIncomeSum_"&RowNum).toDecimal
		if insSum = 0 then 
		  FormFields.ItemByName("InsIncomeSum_"&RowNum).SetCheckValue("")
      FormFields.ItemByName("TaxRate_"&RowNum).SetCheckValue("")			
		end if
	end if

	if rsnCode = "02" or rsnCode = "16" then
		if FormFields.ItemByName("ReasonDetCode_"&RowNum).value = "" OR FormFields.ItemByName("ReasonDetText_"&RowNum).value = "" OR FormFields.ItemByName("LawActArticle_"&RowNum).value = "" then
			form.setError "Pasirinkus priežastį ATLEIDIMAS laukai A7, A8 ir A30 yra privalomi" , GetFieldObjects(FormFields, Array("ReasonDetCode_", "ReasonDetText_", "LawActArticle_"), RowNum), EL_ERROR
			Exit Function
		end if
				
		if FormFields.ItemByName("CompensatedMonthsCount_"&RowNum).value = "" then
			EilNr = FormFields.ItemByName("RowNumber_"&RowNum).value
			form.setError "Laukelis A33 turi būti užpildytas. A1 - Eil. nr. "&EilNr , GetFieldObjects(FormFields, Array("CompensatedMonthsCount_"), RowNum), EL_ERROR
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
	else
		if Not FormFields.ItemByName("LawActArticle_"&RowNum).value = "" OR Not FormFields.ItemByName("LawActPart_"&RowNum).value = "" OR Not FormFields.ItemByName("LawActSubsection_"&RowNum).value = "" then
			form.setError "Šiai priežasčiai laukai A30-A32 nėra pildomi" , GetFieldObjects(FormFields, Array("LawActArticle_", "LawActPart_", "LawActSubsection_"), RowNum), EL_ERROR
			Exit Function
		end if
		
		if rsnCode = "96" then
			FormFields.ItemByName("CompensatedMonthsCount_"&RowNum).SetCheckValue("")
		end if	
		
	end if

	ValidateRow = true
End function

Function ValidateReason(FormFields, PageNum, RowNum, RsnCode)
	dim rsnText
	dim rsnDetCode
	dim rsnTextExist
	dim rsnDetText
	
	ValidateReason = false

	if RsnCode = "05" or RsnCode = "06" then
		rsnDetText = ucase(GetReasonDetTextByCode(RsnCode, FormFields.ItemByName("ReasonDetCode_"&RowNum).value))
		if not (ucase(FormFields.ItemByName("ReasonDetText_"&RowNum).value) = rsnDetText) then
			FormFields.ItemByName("ReasonDetText_"&RowNum).SetCheckValue(rsnDetText)
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
	
	if rsnCode = "02" or rsnCode = "05" or rsnCode = "06" or rsnCode = "10" or rsnCode = "11" or rsnCode = "16" then
		If Not CompleteFieldSet(FormFields, GetFieldNames(Array("ReasonDetCode_","ReasonDetText_"), RowNum), False) then
			form.setError "Nenurodytas pranešimo pateikimo priežasties patikslinimas "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonDetCode_","ReasonDetText_"), RowNum), EL_ERROR
			Exit Function
		end if
	else
		If CompleteFieldSetAny(FormFields, GetFieldNames(Array("ReasonDetCode_","ReasonDetText_"), RowNum)) then
			form.setError "Nurodytai pranešimo pateikimo priežasčiai patikslinimo nurodyti nereikia "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonDetCode_","ReasonDetText_"), RowNum), EL_ERROR
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
	
	if rsnCode = "23" and DateValue(FormFields.ItemByName("InsuranceEndDate_"&RowNum).toDate) < DateValue("2022-01-01") then
	  form.setError "23 pateikimo priežastį pasirinkti galima tik tada, kai atleidimo data yra 2022-01-01 ir vėlesnė "&PageNum&" lapo "&RowNum&" eilutėje", GetFieldObjects(FormFields, Array("ReasonCode_","InsuranceEndDate_"), RowNum), EL_ERROR
		Exit Function
	end if
	
	ValidateReason = true
End FUnction

Function ValidateTaxes(Fields, PageNum, RowNum)
	dim taxRate

	ValidateTaxes = False
	if Fields.itemByName("TaxRate_"&RowNum).value = "" then
		form.setError "Turi būti nurodytas bendras įmokų tarifas "&PageNum&" lapo "&RowNum&" eilutėje", array(Fields.itemByName("TaxRate_"&RowNum)), EL_ERROR
		Exit Function
	end if
	
	taxRate = Fields.itemByName("TaxRate_"&RowNum).toDecimal
	
	if Fields.ItemByName("InsuranceEndDate_"&RowNum).todate >= DateValue("2019-01-01") then
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
		Call form.SetOnChangedHandlerEx("OnChangeA", Cstr(FormDefs(0)), "LawActArticle_"&Cstr(i))
		Call form.SetOnChangedHandlerEx("OnChangeP", Cstr(FormDefs(0)), "LawActPart_"&Cstr(i))
		Call form.SetOnChangedHandlerEx("OnChangeS", Cstr(FormDefs(0)), "LawActSubsection_"&Cstr(i))
	next

	for i = 1 to RowCountSupl
		Call form.SetOnChangedHandlerEx("OnChangeR", Cstr(FormDefs(1)), "ReasonCode_"&Cstr(i))
		Call form.SetOnChangedHandlerEx("OnChangeRD", Cstr(FormDefs(1)), "ReasonDetCode_"&Cstr(i))
		Call form.SetOnChangedHandlerEx("OnChangeA", Cstr(FormDefs(1)), "LawActArticle_"&Cstr(i))
		Call form.SetOnChangedHandlerEx("OnChangeP", Cstr(FormDefs(1)), "LawActPart_"&Cstr(i))
		Call form.SetOnChangedHandlerEx("OnChangeS", Cstr(FormDefs(1)), "LawActSubsection_"&Cstr(i))
	next
End sub

Sub OnChangeR(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode, selectedDetCode, selectedLawActArticle, selectedLawActPart
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

	selectedDetCode = formFields.ItemByName("ReasonDetCode_"&Cstr(FieldIndex)).Value
	selectedLawActArticle = formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).value
	selectedLawActPart = formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).value
	if selectedCode = "02" or selectedCode = "16" then
		Call formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).AttachList(GetLawActArticleList(selectedCode, selectedDetCode))
		Call formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).AttachList(GetLawActPartList(selectedCode, selectedDetCode, selectedLawActArticle))
		Call formFields.itemByName("LawActSubsection_"&Cstr(FieldIndex)).AttachList(GetLawActSubsectionList(selectedCode, selectedDetCode, selectedLawActArticle, selectedLawActPart))
	else
		Call formFields.ItemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue("")
	end if
End Sub

Sub OnChangeRD(PageName, PageIndex, FieldName)
	dim pages, formFields
	dim selectedCode, selectedDetCode, selectedDetText, selectedLawActArticle, selectedLawActPart
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
	
	selectedDetCode = formFields.ItemByName("ReasonDetCode_"&Cstr(FieldIndex)).Value
	selectedLawActArticle = formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).value
	selectedLawActPart = formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).value
	if selectedCode = "02" or selectedCode = "16" then
		Call formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).AttachList(GetLawActArticleList(selectedCode, selectedDetCode))
		Call formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).AttachList(GetLawActPartList(selectedCode, selectedDetCode, selectedLawActArticle))
		Call formFields.itemByName("LawActSubsection_"&Cstr(FieldIndex)).AttachList(GetLawActSubsectionList(selectedCode, selectedDetCode, selectedLawActArticle, selectedLawActPart))
	else
		Call formFields.ItemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue("")
	end if
End Sub

Sub OnChangeA(PageName, PageIndex, FieldName)
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
		Call formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).AttachList(GetLawActPartList(selectedCode, selectedDetCode, selectedLawActArticle))
		Call formFields.itemByName("LawActSubsection_"&Cstr(FieldIndex)).AttachList(GetLawActSubsectionList(selectedCode, selectedDetCode, selectedLawActArticle, selectedLawActPart))
	else
		Call formFields.ItemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue("")
	end if
End Sub

Sub OnChangeP(PageName, PageIndex, FieldName)
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
		Call formFields.itemByName("LawActSubsection_"&Cstr(FieldIndex)).AttachList(GetLawActSubsectionList(selectedCode, selectedDetCode, selectedLawActArticle, selectedLawActPart))	
	else
		Call formFields.ItemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue("")
	end if
End Sub

Sub OnChangeS(PageName, PageIndex, FieldName)
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
	'Call formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedLawActPart))
	selectedLawActSubsection = formFields.itemByName("LawActSubsection_"&Cstr(FieldIndex)).value
	if selectedCode = "02" or selectedCode = "16" then
		Call formFields.itemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedLawActSubsection))
	else
		Call formFields.ItemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue("")
		Call formFields.ItemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue("")
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
	dim selectedCode, selectedCodeDet, selectedLawActArticle, selectedLawActPart
	dim i

	set pages = Form.GetPagesForTemplate(PageDefName)
	for i = 1 to pages.Count
		set formFields = pages.Item(i).Fields
		selectedCode = formFields.ItemByName("ReasonCode_"&Cstr(FieldIndex)).Value
		if not selectedCode = ReasonMisc then Call formFields.ItemByName("ReasonText_"&Cstr(FieldIndex)).SetCheckValue(GetReasonTextByCode(selectedCode))
		selectedCodeDet = formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).value
		Call formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).AttachList(GetReasonDetList(selectedCode))
		Call formFields.itemByName("ReasonDetCode_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedCodeDet))
		'Call formFields.ItemByName("ReasonDetText_"&Cstr(FieldIndex)).SetCheckValue("")
		
		if selectedCode = "02" or selectedCode = "16" then		
			selectedLawActArticle = formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).value
			Call formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).AttachList(GetLawActArticleList(selectedCode, selectedCodeDet))
			Call formFields.itemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedLawActArticle))
			selectedLawActPart = formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).value
			Call formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).AttachList(GetLawActPartList(selectedCode, selectedCodeDet, selectedLawActArticle))
			Call formFields.itemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue(Cstr(selectedLawActPart))
		else
			Call formFields.ItemByName("LawActArticle_"&Cstr(FieldIndex)).SetCheckValue("")
			Call formFields.ItemByName("LawActPart_"&Cstr(FieldIndex)).SetCheckValue("")
			Call formFields.ItemByName("LawActSubsection_"&Cstr(FieldIndex)).SetCheckValue("")
		end if
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

Function GetLawActArticleList(ReasonCode, ReasonDetCode)
	dim lstLine
	dim i, j, k

	for i=0 to UBound(ReasonList)
		if ReasonList(i)(0) = ReasonCode then
			for j=0 to UBound(ReasonList(i)(2))
				if ReasonList(i)(2)(j)(0) = ReasonDetCode then
					for k=0 to UBound(ReasonList(i)(2)(j)(2))
						if not lstLine = "" then lstLine = lstLine & "###"
						lstLine = lstLine & ReasonList(i)(2)(j)(2)(k)(0)&";"&ReasonList(i)(2)(j)(2)(k)(1)
					next
				end if
			next
			GetLawActArticleList = split(lstLine, "###")
			Exit Function
		end if
	next

	GetLawActArticleList = Array("")
End Function

Function GetLawActPartList(ReasonCode, ReasonDetCode, LawActArticle)
	dim lstLine
	dim i, j, k, m

	for i=0 to UBound(ReasonList)
		if ReasonList(i)(0) = ReasonCode then
			for j=0 to UBound(ReasonList(i)(2))
				if ReasonList(i)(2)(j)(0) = ReasonDetCode then
					for k=0 to UBound(ReasonList(i)(2)(j)(2))
						if ReasonList(i)(2)(j)(2)(k)(0) = LawActArticle then
							for m=0 to UBound(ReasonList(i)(2)(j)(2)(k)(2))
								if not lstLine = "" then lstLine = lstLine & "###"
								lstLine = lstLine & ReasonList(i)(2)(j)(2)(k)(2)(m)(0)&";"&ReasonList(i)(2)(j)(2)(k)(2)(m)(1)
							next
						end if
					next
				end if
			next
			GetLawActPartList = split(lstLine, "###")
			Exit Function
		end if
	next

	GetLawActPartList = Array("")
End Function

Function GetLawActSubsectionList(ReasonCode, ReasonDetCode, LawActArticle, LawActPart)
	dim lstLine
	dim i, j, k, m, n

	for i=0 to UBound(ReasonList)
		if ReasonList(i)(0) = ReasonCode then
			for j=0 to UBound(ReasonList(i)(2))
				if ReasonList(i)(2)(j)(0) = ReasonDetCode then
					for k=0 to UBound(ReasonList(i)(2)(j)(2))
						if ReasonList(i)(2)(j)(2)(k)(0) = LawActArticle then
							for m=0 to UBound(ReasonList(i)(2)(j)(2)(k)(2))
								if ReasonList(i)(2)(j)(2)(k)(2)(m)(0) = LawActPart then
									for n=0 to UBound(ReasonList(i)(2)(j)(2)(k)(2)(m)(2))
										if not lstLine = "" then lstLine = lstLine & "###"
										lstLine = lstLine & ReasonList(i)(2)(j)(2)(k)(2)(m)(2)(n)(0)&";"&ReasonList(i)(2)(j)(2)(k)(2)(m)(2)(n)(1)
									next
								end if
							next
						end if
					next
				end if
			next
			GetLawActSubsectionList = split(lstLine, "###")
			Exit Function
		end if
	next

	GetLawActSubsectionList = Array("")
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
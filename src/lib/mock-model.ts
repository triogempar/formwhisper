import type { Checklist, FieldContext, FieldExplanation, PageScan, SemanticType } from './types'

const RULES: { type: SemanticType; test: RegExp }[] = [
  { type: 'dateOfBirth', test: /date of birth|\bdob\b|birth date/i },
  { type: 'email', test: /e-?mail/i },
  { type: 'phone', test: /phone|mobile|telephone/i },
  { type: 'passportNumber', test: /passport (number|no\.?|#)/i },
  { type: 'nationalId', test: /national id|identity number/i },
  { type: 'taxId', test: /taxpayer|tax identification|\btin\b|social security/i },
  { type: 'driversLicense', test: /driver/i },
  { type: 'postalCode', test: /postal|zip code|post code/i },
  { type: 'addressLine2', test: /apartment|address line 2|flat|suite/i },
  { type: 'addressLine1', test: /street|address line 1|mailing address|residential address/i },
  { type: 'city', test: /\bcity\b/i },
  { type: 'region', test: /\bstate\b|province|\bregion\b/i },
  { type: 'nationality', test: /nationality|citizenship/i },
  { type: 'country', test: /country/i },
  { type: 'occupation', test: /occupation|profession|job title/i },
  { type: 'employer', test: /employer/i },
  { type: 'preferredName', test: /preferred name|nickname/i },
  { type: 'legalName', test: /legal name|full name|name as .*passport|surname/i },
]

const COPY: Record<SemanticType, Omit<FieldExplanation, 'semanticType'>> = {
  legalName: {
    explanation: 'This is the name printed on your identity papers, including a middle name if it appears there. It is used to match you to a record, not as a greeting.',
    whyAsked: 'A mismatch with the document you will be asked to show is the usual reason a form is sent back.',
    commonMistakes: ['A nickname in place of the legal name', 'Dropping a middle name that is printed on the ID', 'Putting two people in one box'],
    sensitivity: 'ordinary',
  },
  preferredName: {
    explanation: 'This is the name you want used in conversation. It does not replace the legal name on identity documents.',
    whyAsked: 'Some offices keep a separate greeting name so letters do not use a name you have set aside.',
    commonMistakes: ['Repeating the legal name when you wanted a shorter one', 'Adding a title such as Dr. in the name box'],
    sensitivity: 'ordinary',
  },
  dateOfBirth: {
    explanation: 'The day, month, and year you were born, as printed on your identity document. It distinguishes you from someone else with the same name.',
    whyAsked: 'Age rules, tax years, and visa categories all depend on this date.',
    commonMistakes: ['Swapping month and day', 'Using the day you signed the form', 'A year from memory that is off by one'],
    sensitivity: 'ordinary',
  },
  email: {
    explanation: 'An email address you can open. The office will send receipts and questions there.',
    whyAsked: 'It is the return path if something on the form needs a correction.',
    commonMistakes: ['A work address you will lose access to', 'A missing dot in the domain'],
    sensitivity: 'ordinary',
  },
  phone: {
    explanation: 'A telephone number where a clerk can reach you if a signature or a document is missing.',
    whyAsked: 'Some checks are still done by a phone call rather than by email.',
    commonMistakes: ['Dropping the country code on an international form', 'A number that belongs to a previous phone'],
    sensitivity: 'ordinary',
  },
  addressLine1: {
    explanation: 'The street and building number where mail for you is accepted. Apartment or unit numbers belong on the next line when there is one.',
    whyAsked: 'The office uses it for correspondence and, on some forms, to confirm you live in the area the form covers.',
    commonMistakes: ['A post-office box when the form asks for a residence', 'Abbreviating the street so it no longer matches your proof of address'],
    sensitivity: 'ordinary',
  },
  addressLine2: {
    explanation: 'The apartment, suite, or floor. Leave it blank if your street line is already complete.',
    whyAsked: 'Mail is returned when the building has many units and this line is empty.',
    commonMistakes: ['Repeating the street here', 'A buzzer code that is not part of the postal address'],
    sensitivity: 'ordinary',
  },
  city: {
    explanation: 'The city or town in the postal address, not the neighborhood and not the county.',
    whyAsked: 'It is part of the address block that is checked against your proof of address.',
    commonMistakes: ['A neighborhood name in place of the city', 'The city where you work rather than where you live'],
    sensitivity: 'ordinary',
  },
  region: {
    explanation: 'The state, province, or region in the address. Use the form the postal service prints, not a slang abbreviation you invented.',
    whyAsked: 'Tax and benefits forms often only apply inside one region.',
    commonMistakes: ['The country written again', 'A two-letter code when the form asked you to spell it out'],
    sensitivity: 'ordinary',
  },
  postalCode: {
    explanation: 'The postal code for the address on the lines above. It is checked together with the street, not on its own.',
    whyAsked: 'A wrong code is enough for a mailed decision to go to another building.',
    commonMistakes: ['The code for a previous home', 'Letters and digits in the wrong order'],
    sensitivity: 'ordinary',
  },
  country: {
    explanation: 'The country of the address you just gave. It is not automatically the country of your citizenship.',
    whyAsked: 'The office needs to know where to send paper and which address rules apply.',
    commonMistakes: ['Citizenship written here instead of the country you live in'],
    sensitivity: 'ordinary',
  },
  nationality: {
    explanation: 'The citizenship printed in your passport. If you hold more than one, use the passport you will show with this form.',
    whyAsked: 'Visa, tax, and banking forms treat nationality as a legal status, separate from where you live.',
    commonMistakes: ['The country you live in, when it is not the passport country', 'An ethnicity rather than a citizenship'],
    sensitivity: 'ordinary',
  },
  occupation: {
    explanation: 'The work you do, in ordinary words. It is a description, not your employer’s legal name.',
    whyAsked: 'Banks and benefit offices use it as part of knowing what the account or the claim is for.',
    commonMistakes: ['A job title from a decade ago', 'The word “unemployed” in a box that asked for a profession you still hold'],
    sensitivity: 'ordinary',
  },
  employer: {
    explanation: 'The organisation that pays you. If you are self-employed, the form’s help text usually says whether to write your own name or “self-employed”.',
    whyAsked: 'It is a way to check the occupation line and, on some forms, the source of funds.',
    commonMistakes: ['A brand name that is not the legal employer', 'Leaving it blank when the occupation line says you work for someone'],
    sensitivity: 'ordinary',
  },
  taxId: {
    explanation: 'The taxpayer number this office already uses to file you. It is a file key, not a bank PIN, and it is not printed on a debit card.',
    whyAsked: 'Returns and some bank accounts are rejected when this number does not match the name on the first line.',
    commonMistakes: ['Someone else’s number on your line', 'Spaces or dashes the box told you to omit', 'A passport number in a tax box'],
    sensitivity: 'identity',
  },
  nationalId: {
    explanation: 'The number on your national identity card. Use the document the form names, not whichever card is in your wallet.',
    whyAsked: 'It is how the office ties the form to a civil record.',
    commonMistakes: ['The card’s serial number instead of the personal number', 'An expired card’s number when a new one has been issued'],
    sensitivity: 'identity',
  },
  passportNumber: {
    explanation: 'The passport number from the page with your photograph, not the number printed on an entry stamp.',
    whyAsked: 'A visa file is opened against that passport. A different number creates a second, conflicting file.',
    commonMistakes: ['The passport number of a previous booklet', 'The identity-card number', 'Reading a letter O as a zero'],
    sensitivity: 'identity',
  },
  driversLicense: {
    explanation: 'The number on your driver’s license. Only use it when the form names that document.',
    whyAsked: 'Some offices accept it as a second identity check when a passport is not required.',
    commonMistakes: ['The card’s issue number rather than the license number', 'A license from a region you no longer hold'],
    sensitivity: 'identity',
  },
  other: {
    explanation: 'This question belongs to the form itself. Formwhisper does not keep a saved fact for it, so nothing will be filled for you.',
    whyAsked: 'The organisation uses the answer to decide whether the rest of the form applies.',
    commonMistakes: ['Leaving a required box blank', 'Answering a nearby question instead of this one'],
    sensitivity: 'ordinary',
  },
}

export function inferSemanticType(field: FieldContext): SemanticType {
  const haystack = [field.label, field.name, field.placeholder, field.autocomplete, field.helpText, field.legend].join(' ')
  for (const rule of RULES) {
    if (rule.test.test(haystack)) return rule.type
  }
  return 'other'
}

export function mockExplain(field: FieldContext): FieldExplanation {
  const semanticType = inferSemanticType(field)
  return { semanticType, ...COPY[semanticType] }
}

function documentsFor(field: FieldContext): string[] {
  const type = inferSemanticType(field)
  if (type === 'taxId') return ['The notice that issued your taxpayer number']
  if (type === 'passportNumber') return ['The passport you will travel with']
  if (type === 'nationalId') return ['The identity card named on the form']
  if (type === 'addressLine1' || type === 'city' || type === 'postalCode') return ['A recent proof of address']
  if (type === 'legalName' || type === 'dateOfBirth') return ['The identity document you will attach']
  if (type === 'employer' || type === 'occupation') return []
  return []
}

export function mockChecklist(fields: FieldContext[], title: string): Checklist {
  const items = fields.map((field) => {
    const explained = mockExplain(field)
    return {
      label: field.label || field.name || 'Untitled field',
      required: field.required,
      plainMeaning: explained.explanation,
      documents: documentsFor(field),
    }
  })
  const documentsToGather = [...new Set(items.flatMap((item) => item.documents))].slice(0, 8)
  const requiredCount = items.filter((item) => item.required).length
  return {
    formTitle: title || 'This form',
    summary: `${items.length} questions on this page, ${requiredCount} marked required. Gather the papers first, then fill the boxes.`,
    items,
    documentsToGather,
    beforeYouSubmit: [
      'Read every required row before you sign.',
      'Check that the name matches the identity document character for character.',
      'Do not photograph a passport unless this form asks for the image.',
    ],
  }
}

export function mockScan(): PageScan {
  return {
    pageSummary: 'The visible page is a specimen form with a scanned-looking stamp panel. The boxes in the stamp are part of the picture, not separate inputs.',
    fields: [
      {
        label: 'Name as in passport',
        plainMeaning: 'The name on the photograph page, copied as printed.',
        required: true,
        commonMistake: 'Using a shortened name that is not in the passport.',
      },
      {
        label: 'Passport number',
        plainMeaning: 'The number on the photograph page, not the number on an old stamp.',
        required: true,
        commonMistake: 'Copying a digit from the stamp panel.',
      },
      {
        label: 'Stamp panel',
        plainMeaning: 'A picture of a previous stamp. It is not a field you can type into.',
        required: false,
        commonMistake: 'Trying to click the printed boxes inside the scan.',
      },
    ],
    documentsToGather: ['Passport photograph page', 'Previous visa or entry stamp, if the form asks for it'],
    cautions: [
      'A scan can hide which boxes are required. Compare the picture with any real inputs above it.',
      'Do not read handwritten numbers in the picture back into the form unless you can check them against the passport.',
    ],
  }
}

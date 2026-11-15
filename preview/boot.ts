const forms: Record<string, string> = {
  tax: '/samples/tax-return.html',
  bank: '/samples/bank-kyc.html',
  visa: '/samples/visa.html',
}

const form = new URLSearchParams(location.search).get('form') || 'tax'
const frame = document.getElementById('fw-form-frame')
if (frame instanceof HTMLIFrameElement) frame.src = forms[form] || forms.tax

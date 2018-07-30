const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveBills,
  log
} = require('cozy-konnector-libs')
const request = requestFactory({
  cheerio: true,
  json: false,
  jar: true,
  debug: false
})

const moment = require('moment')
moment.locale('fr')

const baseUrl = 'https://www.wanimo.com/fr/compte'
const loginUrl = baseUrl + '/identification'
const billUrl = baseUrl + '/mes-commandes/'

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')

  log('info', 'Fetching the list of bills')
  const $ = await request(billUrl)

  log('info', 'Parsing bills')
  const documents = await parseBills($)

  log('info', 'Saving data to Cozy')
  await saveBills(documents, fields.folderPath, {
    identifiers: ['wanimo']
  })
}

async function authenticate(username, password) {
  return signin({
    url: loginUrl,
    formSelector: '#connect-form',
    formData: $ => {
      const token = $('input[name="sign_in_by_email[_token]"]').val()
      return {
        'sign_in_by_email[email]': username,
        'sign_in_by_email[password]': password,
        'sign_in_by_email[_token]': token
      }
    },
    // the validate function will check if logout link is present
    validate: (statusCode, $) => {
      if ($('a[href$="/fr/compte/deconnexion"]').length > 1) {
        return true
      } else {
        log('error', $('.warning.displayBlock').text())
        return false
      }
    }
  })
}

function parseBills($) {
  const bills = scrape(
    $,
    {
      id: {
        sel: '.commande',
        parse: id => id.replace('Commande N°', '').trim()
      },
      date: {
        sel: '.date',
        parse: date => moment(date, 'DD/MM/YYYY').add(moment().utcOffset(), 'm')
      },
      amount: {
        sel: '.price :nth-child(2)',
        parse: normalizePrice
      },
      fileurl: {
        sel: '.actions :nth-child(2) a',
        attr: 'href'
      }
    },
    '.orders-table .row'
  )

  return bills.map(bill => ({
    ...bill,
    filename: `${bill.date.format('YYYY-MM-DD')}_${String(bill.amount)
      .replace('.', ',')}€.pdf`,
    date: bill.date.toDate(),
    currency: '€',
    vendor: 'wanimo',
    metadata: {
      importDate: new Date(),
      version: 1
    }
  }))
}

// convert a price string to a float
function normalizePrice(price) {
  return parseFloat(price.replace('€', '')
                          .trim()
                          .replace(',', '.'))
}

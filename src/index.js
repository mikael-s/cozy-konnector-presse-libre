const {
  BaseKonnector,
  requestFactory,
  scrape,
  log
} = require('cozy-konnector-libs')
const request = requestFactory({
  // The debug mode shows all the details about HTTP requests and responses. Very useful for
  // debugging but very verbose. This is why it is commented out by default
  debug: true,
  // Activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: true,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: false,
  // This allows request-promise to keep cookies between requests
  jar: true
})
const requestJSON = requestFactory({
  // The debug mode shows all the details about HTTP requests and responses. Very useful for
  // debugging but very verbose. This is why it is commented out by default
  debug: true,
  // Activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: false,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: true,
  // This allows request-promise to keep cookies between requests
  jar: true
})

const VENDOR = 'presselibre'
const baseUrl = 'https://beta.lapresselibre.fr'

module.exports = new BaseKonnector(start)

// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
// cozyParameters are static parameters, independents from the account. Most often, it can be a
// secret api key.
async function start(fields, cozyParameters) {
  log('info', 'Authenticating ...')
  if (cozyParameters) log('debug', 'Found COZY_PARAMETERS')
  await authenticate.bind(this)(fields.login, fields.password)
  log('info', 'Successfully logged in')
  // The BaseKonnector instance expects a Promise as return of the function
  // log('info', 'Fetching the list of documents')
  const $ = await request(`${baseUrl}/gestion`)
  // // cheerio (https://cheerio.js.org/) uses the same api as jQuery (http://jquery.com/)
  log('info', 'Parsing list of documents')
  const documents = await parseDocuments($, fields.login)

  // // Here we use the saveBills function even if what we fetch are not bills,
  // // but this is the most common case in connectors
  log('info', 'Saving data to Cozy')
  await this.saveBills(documents, fields, {
    identifiers: ['Inpact Media']
  })
}

// This shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
async function authenticate(username, password) {
  const loginForm = {
    email: username,
    password: password
  }
  const res = await requestJSON.post(`${baseUrl}/login`, {
    form: loginForm
  })
  if (!res.isValid) {
    throw new Error('LOGIN_FAILED')
  }
}

// The goal of this function is to parse a HTML page wrapped by a cheerio instance
// and return an array of JS objects which will be saved to the cozy by saveBills
// (https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#savebills)
function parseDocuments($, login) {
  // You can find documentation about the scrape function here:
  // https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#scrape
  const refContract = login
  const docs = scrape(
    $,
    {
      date: {
        sel: 'td:nth-child(1)',
        parse: text => normalizeDate(text.replace(/\//g, '-').trim())
      },
      billNumber: {
        sel: 'td:nth-child(2)'
      },
      amount: {
        sel: 'td:nth-child(3)',
        parse: normalizePrice
      },
      billPath: {
        sel: 'td:nth-child(5) a',
        attr: 'href'
      }
    },
    '#facturation-infos tbody tr'
  )
  return docs.map(doc => ({
    ...doc,
    refContract,
    date: doc.date,
    currency: '€',
    filename: `${formatDate(doc.date)}_${doc.amount}EUR_${doc.billNumber}.pdf`,
    vendorRef: doc.billNumber,
    amount: parseFloat(doc.amount),
    fileurl: `${baseUrl}/${doc.billPath}`,
    vendor: VENDOR
  }))
}

function normalizeDate(date) {
  const [day, month, year] = date.split('-')
  return new Date(`${year}-${month}-${day}`)
}

// Convert a price string to a float
function normalizePrice(price) {
  return parseFloat(
    price
      .replace('€', '')
      .replace(',', '.')
      .trim()
  )
}

function formatDate(date) {
  let month = date.getMonth() + 1
  if (month < 10) {
    month = '0' + month
  }

  let day = date.getDate()
  if (day < 10) {
    day = '0' + day
  }

  let year = date.getFullYear()

  return `${year}${month}${day}`
}

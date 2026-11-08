/**
 * AURA Multi-Store Marketplace — Google Sheets Cloud Database Script
 *
 * HOW TO DEPLOY (Takes 1 Minute):
 * 1. Create a new Google Sheet at https://sheets.new (name it "AURA Marketplace Database").
 * 2. In the top menu, click Extensions -> Apps Script.
 * 3. Delete any code in Code.gs and paste this entire file.
 * 4. Click Save (disk icon), then click "Deploy" (top right) -> "New deployment".
 * 5. Click the gear icon next to "Select type" -> choose "Web app".
 * 6. Set:
 *    - Description: AURA Multi-Store Database API
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 7. Click "Deploy", authorize access, and copy the "Web app URL" (ends with /exec).
 * 8. Paste that Web app URL into your AURA Admin Portal -> Customers tab (or Store Settings).
 */

function ensureSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var custSheet = ss.getSheetByName('Customers');
  if (!custSheet) {
    custSheet = ss.insertSheet('Customers');
    custSheet.appendRow([
      'Customer ID',
      'Full Name',
      'Phone / WhatsApp',
      'Email',
      'District',
      'Delivery Address',
      'Account Status',
      'Total Orders',
      'Total Spent (LKR)',
      'Last Updated',
      'Orders JSON',
      'Password Hash'
    ]);
    custSheet.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#E0E7FF');
  }

  var ordSheet = ss.getSheetByName('Orders');
  if (!ordSheet) {
    ordSheet = ss.insertSheet('Orders');
    ordSheet.appendRow([
      'Order ID',
      'Date (SLST)',
      'Customer Name',
      'Phone / WhatsApp',
      'Email',
      'District',
      'Delivery Address',
      'Ordered Items',
      'Order Total (LKR)',
      'Payment Method'
    ]);
    ordSheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#E0E7FF');
  }

  var prodSheet = ss.getSheetByName('Products');
  if (!prodSheet) {
    prodSheet = ss.insertSheet('Products');
    prodSheet.appendRow([
      'Product ID',
      'Title',
      'Category',
      'Brand',
      'Price (LKR)',
      'Stock Status',
      'Image URL',
      'Description'
    ]);
    prodSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#E0E7FF');
  }

  var revSheet = ss.getSheetByName('Reviews');
  if (!revSheet) {
    revSheet = ss.insertSheet('Reviews');
    revSheet.appendRow([
      'Review ID',
      'Product ID',
      'Product Title',
      'Customer Name',
      'Rating (1-5)',
      'Comment',
      'Date'
    ]);
    revSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#E0E7FF');
  }

  var setSheet = ss.getSheetByName('StoreSettings');
  if (!setSheet) {
    setSheet = ss.insertSheet('StoreSettings');
    setSheet.appendRow(['Key', 'Value']);
    setSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#E0E7FF');
  }

  return { ss: ss, custSheet: custSheet, ordSheet: ordSheet, prodSheet: prodSheet, revSheet: revSheet, setSheet: setSheet };
}

function doGet(e) {
  var sheets = ensureSheets();
  var custSheet = sheets.custSheet;
  var setSheet = sheets.setSheet;
  var revSheet = sheets.revSheet;

  var custData = custSheet.getDataRange().getValues();
  var customers = [];
  for (var i = 1; i < custData.length; i++) {
    var r = custData[i];
    if (!r[0] && !r[1] && !r[2]) continue;
    var ordersArr = [];
    try {
      ordersArr = r[10] ? JSON.parse(r[10]) : [];
    } catch (err) {
      ordersArr = [];
    }
    customers.push({
      id: String(r[0] || ''),
      name: String(r[1] || ''),
      phone: String(r[2] || ''),
      email: String(r[3] || ''),
      district: String(r[4] || ''),
      address: String(r[5] || ''),
      isRegistered: String(r[6] || '') === 'Registered Account',
      totalSpentLkr: Number(r[8] || 0),
      updatedAt: String(r[9] || ''),
      orders: Array.isArray(ordersArr) ? ordersArr : [],
      passwordHash: String(r[11] || '')
    });
  }

  var revData = revSheet.getDataRange().getValues();
  var reviews = [];
  for (var k = 1; k < revData.length; k++) {
    var rv = revData[k];
    if (!rv[0] && !rv[1]) continue;
    reviews.push({
      id: String(rv[0] || ''),
      productId: Number(rv[1] || 0),
      productTitle: String(rv[2] || ''),
      author: String(rv[3] || 'Verified Buyer'),
      rating: Number(rv[4] || 5),
      comment: String(rv[5] || ''),
      date: String(rv[6] || '')
    });
  }

  var setData = setSheet.getDataRange().getValues();
  var settings = {};
  for (var j = 1; j < setData.length; j++) {
    var key = String(setData[j][0] || '').trim();
    if (key) settings[key] = String(setData[j][1] || '');
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, customers: customers, reviews: reviews, settings: settings }))
    .setMimeType(ContentService.MimeType.JSON);
}

function upsertCustomerRow(custSheet, c) {
  var data = custSheet.getDataRange().getValues();
  var phoneClean = String(c.phone || '').replace(/[^0-9]/g, '').replace(/^94/, '0');
  var emailLower = String(c.email || '').trim().toLowerCase();
  var orders = Array.isArray(c.orders) ? c.orders : [];
  var rowValues = [
    c.id || ('CUST-' + new Date().getTime()),
    c.name || '',
    c.phone || '',
    c.email || '',
    c.district || '',
    c.address || '',
    c.isRegistered ? 'Registered Account' : 'Checkout Customer',
    orders.length,
    Number(c.totalSpentLkr || 0),
    c.updatedAt || c.createdAt || new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' }),
    JSON.stringify(orders),
    c.passwordHash || ''
  ];

  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    var rowId = String(data[i][0] || '');
    var rowPhone = String(data[i][2] || '').replace(/[^0-9]/g, '').replace(/^94/, '0');
    var rowEmail = String(data[i][3] || '').trim().toLowerCase();
    if ((c.id && rowId === c.id) ||
        (phoneClean && rowPhone === phoneClean) ||
        (emailLower && rowEmail === emailLower)) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow > 0) {
    custSheet.getRange(foundRow, 1, 1, 12).setValues([rowValues]);
  } else {
    custSheet.appendRow(rowValues);
  }
}

function doPost(e) {
  try {
    var sheets = ensureSheets();
    var body = JSON.parse(e.postData.contents || '{}');
    var action = body.action || '';

    if (action === 'upsert_customer' && body.customer) {
      upsertCustomerRow(sheets.custSheet, body.customer);
      if (body.newOrder) {
        var o = body.newOrder;
        var c = body.customer;
        var itemsSummary = (o.items || []).map(function(it) {
          return it.title + ' x' + it.qty + ' (Rs. ' + (it.lkr * it.qty) + ')';
        }).join(', ');
        sheets.ordSheet.appendRow([
          o.id || '',
          o.date || '',
          c.name || '',
          c.phone || '',
          c.email || '',
          c.district || '',
          c.address || '',
          itemsSummary,
          Number(o.totalLkr || 0),
          o.payment || ''
        ]);
      }
    } else if (action === 'add_review' && body.review) {
      var rv = body.review;
      sheets.revSheet.appendRow([
        rv.id || ('REV-' + new Date().getTime()),
        rv.productId || '',
        rv.productTitle || '',
        rv.author || 'Customer',
        Number(rv.rating || 5),
        rv.comment || '',
        rv.date || new Date().toLocaleDateString('en-LK')
      ]);
    } else if (action === 'sync_all_customers' && Array.isArray(body.customers)) {
      for (var i = 0; i < body.customers.length; i++) {
        upsertCustomerRow(sheets.custSheet, body.customers[i]);
      }
    } else if (action === 'delete_customer' && body.customerId) {
      var data = sheets.custSheet.getDataRange().getValues();
      for (var d = data.length - 1; d >= 1; d--) {
        if (String(data[d][0] || '') === String(body.customerId)) {
          sheets.custSheet.deleteRow(d + 1);
          break;
        }
      }
    } else if (action === 'save_settings' && body.settings) {
      sheets.setSheet.clearContents();
      sheets.setSheet.appendRow(['Key', 'Value']);
      sheets.setSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#E0E7FF');
      var keys = Object.keys(body.settings);
      for (var k = 0; k < keys.length; k++) {
        sheets.setSheet.appendRow([keys[k], String(body.settings[keys[k]] || '')]);
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

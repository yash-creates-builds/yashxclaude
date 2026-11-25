export default {
  appName: 'Dhobi Diary',
  dhobi: 'Dhobi',
  // services
  s_iron: 'Iron', s_wash: 'Wash + Iron', s_dry: 'Dry clean',
  // items
  i_shirt: 'Shirt', i_tshirt: 'T-shirt', i_pant: 'Pant', i_jeans: 'Jeans', i_kurta: 'Kurta', i_saree: 'Saree',
  i_salwar: 'Salwar suit', i_dupatta: 'Dupatta', i_bedsheet: 'Bedsheet', i_pillow: 'Pillow cover', i_towel: 'Towel',
  i_blouse: 'Blouse', i_kids: 'Kids clothes', i_blazer: 'Blazer', i_sherwani: 'Sherwani / Lehenga', i_curtain: 'Curtain',
  i_other: 'Other',
  // nav
  nav_home: 'Home', nav_history: 'History', nav_bill: 'Bill', nav_more: 'More',
  // home
  give: 'Give clothes', giveSub: 'Clothes going to the dhobi',
  receive: 'Receive clothes', receiveSub: 'Clothes coming back',
  withDhobi: 'With dhobi', thisMonth: 'This month', missing: 'Missing',
  pendingTitle: 'Still with the dhobi', nothingPending: 'Nothing pending. All clothes are home.',
  seeBill: 'See bill', items: (n) => `${n} ${n === 1 ? 'item' : 'items'}`,
  // status
  st_pending: 'With dhobi', st_partial: 'Partly received', st_received: 'All received',
  // give
  date: 'Date', today: 'Today', yesterday: 'Yesterday', pickDate: 'Other day',
  whichDhobi: 'Which dhobi?', addDhobi: 'Add dhobi', service: 'Service',
  total: 'Total', estimate: 'Approx.', save: 'Save', saved: 'Saved', undo: 'Undo',
  addItem: 'Add item', itemName: 'Item name (e.g. Sweater)', otherHint: 'Add your own',
  nothingAdded: 'Tap + on the clothes you are giving',
  note: 'Note (optional)',
  // receive
  receiveTitle: 'Receive clothes', pickBatch: 'Which bundle came back?', noPendingToReceive: 'Nothing is with the dhobi right now.',
  allReceived: 'All received', adjust: 'Count each item', given: 'Given', got: 'Got',
  saveReceived: 'Save', missingAlert: (list) => `${list} missing`, missingTitle: 'Some clothes did not come back',
  allBack: 'All clothes are back',
  // batch
  batch: 'Bundle', editBatch: 'Edit', deleteBatch: 'Delete bundle', receivedOn: 'Received on',
  confirmDelete: 'Delete this bundle?', confirmDeleteSub: 'You can undo right after.', cancel: 'Cancel', delete: 'Delete', deleted: 'Deleted',
  receiveRest: 'Receive the rest',
  // bill
  billTitle: 'Monthly bill', allDhobis: 'All', amount: 'Amount', markPaid: 'Mark as paid', paid: 'Paid', markUnpaid: 'Mark as not paid',
  shareBill: 'Share bill', noBatchesMonth: 'No clothes given this month.',
  billNote: 'Missing clothes are not charged. Clothes still with the dhobi are counted at full rate.',
  billPendingLine: (n) => `${n} still with dhobi`, billMissingLine: (n) => `${n} missing (not charged)`,
  shareHeader: (m) => `Dhobi bill — ${m}`, shareTotal: 'Total', shareFooter: 'Sent from Dhobi Diary',
  dayGiven: 'Clothes given', dayBack: 'Came back',
  // history
  historyTitle: 'History', search: 'Search', all: 'All', month: 'Month', anyMonth: 'Any month', noResults: 'Nothing found.',
  // rates
  ratesTitle: 'Rates', ratesSub: 'Price for one piece (₹). Tap a number to change it.', resetRates: 'Reset to typical rates',
  ratesReset: 'Rates reset', ratesNote: 'New rates apply to new bundles. Old bundles keep their price.',
  // settings
  moreTitle: 'Settings', language: 'Language', grandma: 'Grandma Mode', grandmaSub: 'Only Give, Receive and Bill. Extra large.',
  dhobis: 'Dhobis', rename: 'Rename', reminders: 'Reminders', remindersSub: 'A reminder on the days the dhobi comes',
  remindTime: 'Time', remindText: 'Dhobi coming today?', remindBody: 'Keep the clothes ready.', remindOff: 'Off',
  remindNeedApp: 'Reminders work in the phone app.',
  backup: 'Backup', exportCsv: 'Export for Excel (CSV)', backupJson: 'Save backup file', restoreJson: 'Restore from backup',
  restored: 'Backup restored', badFile: 'This file is not a Dhobi Diary backup.',
  restoreConfirm: 'Replace everything with this backup?', restoreConfirmSub: 'Your current diary will be replaced. You can undo right after.', restore: 'Restore',
  privacy: 'All data stays on this phone. No login, no internet.',
  exitGrandma: 'Settings', back: 'Back', done: 'Done', ok: 'OK', name: 'Name',
  deleteDhobi: 'Delete dhobi', deleteDhobiSub: 'All bundles of this dhobi will also be deleted.',
  family: 'Family sharing', familySub: 'Coming soon — share one diary with your family.',
  chooseLang: 'Choose language',
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  weekdayLetters: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
};

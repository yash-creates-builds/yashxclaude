export default {
  appName: 'Dhobi Diary',
  dhobi: 'Dhobi',
  // services
  s_iron: 'Iron', s_wash: 'Wash + Iron', s_dry: 'Dry clean',
  // items
  i_shirt: 'Shirt', i_tshirt: 'T-shirt', i_pant: 'Pant', i_jeans: 'Jeans', i_kurta: 'Kurta', i_saree: 'Saree',
  i_salwar: 'Salwar suit', i_dupatta: 'Dupatta', i_bedsheet: 'Bedsheet', i_pillow: 'Pillow cover', i_towel: 'Towel',
  i_blouse: 'Blouse', i_kids: 'Kids clothes', i_blazer: 'Blazer', i_sherwani: 'Sherwani / Lehenga', i_curtain: 'Curtain',
  i_other: 'Other', i_pieces: 'Just count pieces', piecesHint: 'No need to pick the type',
  // nav
  nav_home: 'Home', nav_history: 'History', nav_bill: 'Bill', nav_more: 'Settings',
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
  allReceived: 'All received', adjust: 'Mark each item', given: 'Given', got: 'Got',
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
  dhobis: 'Dhobis', rename: 'Rename',
  backup: 'Backup', exportCsv: 'Export for Excel (CSV)', backupJson: 'Save backup file', restoreJson: 'Restore from backup',
  restored: 'Backup restored', badFile: 'This file is not a Dhobi Diary backup.',
  restoreConfirm: 'Replace everything with this backup?', restoreConfirmSub: 'Your current diary will be replaced. You can undo right after.', restore: 'Restore',
  privacy: 'Your diary stays on this phone. With a family diary, it is also kept in your family’s private online copy.',
  exitGrandma: 'Settings', back: 'Back', done: 'Done', ok: 'OK', name: 'Name',
  deleteDhobi: 'Delete dhobi', deleteDhobiSub: 'All bundles of this dhobi will also be deleted.',
  family: 'Family sharing',
  // visits
  dhobiCame: 'Dhobi came', dhobiCameSub: 'Mark today’s visit', lastVisit: 'Last visit', noVisits: 'No visits marked yet.',
  markVisit: 'Mark visit', visitMarked: 'Visit marked', visitsTitle: 'Dhobi visits', time: 'Time', now: 'Now',
  visitsCount: (n) => `Came ${n} ${n === 1 ? 'time' : 'times'}`, deleteVisit: 'Delete this visit?', seeAll: 'See all',
  byName: (n) => `by ${n}`, givenBy: 'Given by', receivedBy: 'Received by',
  // family sharing
  familySub: 'One diary on every phone in the house', createFamily: 'Start a family diary', createFamilySub: 'You get a code to give your family',
  joinFamily: 'Join with a code', joinFamilySub: 'Someone at home already started one', yourName: 'Your name (e.g. Mummy)',
  enterCode: 'Family code', familyCode: 'Family code', shareCode: 'Send code',
  shareCodeText: (c) => `Join our Dhobi Diary 👕\nOpen the app → Settings → Family → Join with a code\nCode: ${c}`,
  members: 'People', you: 'you', leaveFamily: 'Leave family diary', leaveFamilySub: 'This phone keeps a copy but stops syncing.', leave: 'Leave',
  synced: 'Synced', offlineSync: 'Offline · will sync later', removedSync: 'Removed from family diary', badCode: 'Code not found. Check it and try again.',
  needInternet: 'Needs internet to connect. Try again when online.', familyNotSetUp: 'Family sharing is not switched on in this version yet.',
  joined: 'Joined the family diary', created: 'Family diary ready', connecting: 'Connecting…', codeHint: 'Give this code to everyone at home',
  people: (n) => `${n} ${n === 1 ? 'person' : 'people'}`, next: 'Continue',
  markedToday: 'Dhobi came today', tapToMark: 'Tap here when the dhobi comes', tapToSee: 'see all visits',
  givenThisMonth: 'Clothes given this month', withDhobiNow: 'Currently with dhobi', tapIfCame: 'Tap here if the dhobi came today', attendanceMarked: 'Attendance marked',
  rcYes: 'Came', rcNo: 'Not back', rcSome: 'Some', leftToMark: (n) => `Mark ${n} more`,
  receivedOf: (a, b) => `Received ${a} of ${b}`, cameBackOn: 'Came back on', alreadyBack: (n) => `${n} already back`, markAllCame: 'Mark all as came', notBackYet: (l) => `${l} not back yet`, backLog: 'Came back',
  howMany: 'How many came back?', ofN: (n) => `out of ${n}`,
  seatsTitle: 'Seats', seatsUsed: (u, n) => `${u} of ${n} used`, seatsRule: 'First person is free. ₹19 for each extra person, one time.', addSeat: 'Add a person · ₹19', familyFull: 'This family is full. Ask someone in the family to add a seat (₹19).', seatAdded: 'Seat added. Send the code to the new person.', seatPending: 'Payment received. The seat will appear in a minute.', payFailed: 'Payment did not go through. Please try again.', paymentsSoon: 'Payments will be switched on soon.',
  membersTitle: 'Places', familyFullFree: 'This family already has 5 people, the most for now.',
  chooseLang: 'Choose language',
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  weekdayLetters: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
};

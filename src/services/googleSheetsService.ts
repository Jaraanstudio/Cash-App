
const SPREADSHEET_NAME = 'Kaspur_Data';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

export interface GoogleTransaction {
  id: string;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: string;
  notes?: string;
}

export const createSpreadsheet = async (accessToken: string) => {
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: SPREADSHEET_NAME,
      },
      sheets: [
        {
          properties: {
            title: 'Transactions',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'ID' } },
                    { userEnteredValue: { stringValue: 'Title' } },
                    { userEnteredValue: { stringValue: 'Amount' } },
                    { userEnteredValue: { stringValue: 'Type' } },
                    { userEnteredValue: { stringValue: 'Category' } },
                    { userEnteredValue: { stringValue: 'Date' } },
                    { userEnteredValue: { stringValue: 'Notes' } },
                    { userEnteredValue: { stringValue: 'CreatedAt' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create spreadsheet');
  }

  return await response.json();
};

export const findSpreadsheet = async (accessToken: string) => {
  const query = `name = '${SPREADSHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to search for spreadsheet');
  }

  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
};

export const appendTransaction = async (accessToken: string, spreadsheetId: string, tx: GoogleTransaction) => {
  const values = [
    [
      tx.id,
      tx.title,
      tx.amount,
      tx.type,
      tx.category,
      tx.date,
      tx.notes || '',
      new Date().toISOString(),
    ],
  ];

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to append transaction');
  }

  return await response.json();
};

export const fetchTransactionsFromSheet = async (accessToken: string, spreadsheetId: string): Promise<GoogleTransaction[]> => {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A2:H`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error('Failed to fetch transactions');
  }

  const data = await response.json();
  if (!data.values) return [];

  return data.values.map((row: any[]) => ({
    id: row[0],
    title: row[1],
    amount: parseFloat(row[2]),
    type: row[3] as 'income' | 'expense',
    category: row[4],
    date: row[5],
    notes: row[6],
  }));
};

export const deleteTransactionFromSheet = async (accessToken: string, spreadsheetId: string, txId: string) => {
  // To delete in Sheets API, we usually need to find the row index first
  // Alternatively, we can fetch all, filter, and rewrite. For simplicity in a mobile app, 
  // clear and re-write might be slow. A better way is to find the row index.
  const txs = await fetchTransactionsFromSheet(accessToken, spreadsheetId);
  const rowIndex = txs.findIndex(tx => tx.id === txId);
  
  if (rowIndex === -1) return;

  // Actual row in sheet is rowIndex + 2 (1-indexed + header)
  const actualRow = rowIndex + 1; // 0-indexed for requests usually, but Sheets API delete range is different

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: 0, // Assuming first sheet
              dimension: 'ROWS',
              startIndex: actualRow, // 0-based, inclusive
              endIndex: actualRow + 1, // 0-based, exclusive
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to delete transaction');
  }

  return await response.json();
};

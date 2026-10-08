# Labelbench

Print batches of labels on a **Brady M511** from a CSV or Excel file, on a Mac (or any computer with Chrome or Edge). It runs as a small web app on your own computer and works without internet once it's installed.

![Labelbench with a QR label in the preview](docs/screenshot.png)

- Open a CSV, TSV or Excel (.xlsx) file, then pick which rows to print by ticking them, searching, or typing a range like `1-20, 25`.
- Design the label: lines of text from your columns, sizes, bold, alignment, and an optional QR code, Data Matrix or barcode.
- See the exact label for any row before printing, including the black-and-white bitmap the printer will get.
- Print hundreds of labels in batches, with copies per row (fixed or from a column) and cutting options. If the printer runs out of tape, fix it and continue from where it stopped.
- Every label is checked before printing, so text that doesn't fit shows up before any tape is used.

## What you need

- A Brady M511 printer, connected over Bluetooth.
- **Google Chrome** or **Microsoft Edge**. Safari can't talk to Bluetooth devices from a web page.
- **Node.js** 18 or newer, to run the small local server. Install it from [nodejs.org](https://nodejs.org) (the LTS version).

## Install

1. Download this folder (or `git clone` it).
2. Open Terminal in the folder and run:

   ```sh
   npm install
   ```

   This downloads Brady's printer library and the barcode and Excel libraries. After this, no internet is needed.

## Start

On a Mac, double-click **`Start Labelbench.command`**. The first time, macOS may say it's from an unidentified developer: right-click it, choose **Open**, then **Open** again.

Or, in Terminal:

```sh
npm start
```

Chrome opens at <http://localhost:5511>. Keep the Terminal window open while you print; close it (or press Ctrl+C) to stop.

## Printing your first labels

1. Turn on the printer and click **Connect printer**. Pick the M511 in Chrome's Bluetooth list.
2. Drop your file onto the **Data** panel (or click **Choose file…**). The first row must hold the column names.
3. Click **Use cartridge size** to match the loaded cartridge, or type the size. Labelbench uses the cartridge's *printable area*, which for self-laminating labels is only the white part at the top. If the design and the cartridge don't match, it says so, because the printer would scale every label to fit.
4. Build the label: type text, and press <kbd>{</kbd> to add a value from a column.
5. Click **Print this label** for one test label. If it comes out sideways or upside down, change **Turn when printing**. If thin text is faint, increase **Darkness**.
6. Select the rows and click **Print _n_ labels**.

Use **Save design…** to keep a label design as a file, and **Open design…** to use it again. The current design is also remembered between visits.

## Writing label text

Each text line is typed like ordinary text. Values from your file appear in it as small pills:

- Press <kbd>{</kbd> or click **Insert column**, start typing the column's name, and press Enter (or click it).
- Or click a column name above the lines to insert it where you were last typing.
- Backspace removes a pill in one go.

For example, the line **Shelf** `Shelf` **–** `Room`, with the pills filled from a row where Shelf = B and Room = Store, prints *Shelf B – Store*.

Each line has its own size, **B** (bold), **ABC** (capitals), **Wrap** and alignment.

Long text is shrunk to fit. With **Wrap** on, a line can continue onto a second line. If it still doesn't fit, it's cut with "…", and you're warned before printing.

## Files it reads

- **CSV / TSV**: comma, semicolon (what Norwegian Excel uses) or tab separated. UTF-8, or the older Windows encoding Excel sometimes uses, so æ, ø and å come through.
- **Excel (.xlsx)**: the first sheet with data. Dates are shown as `YYYY-MM-DD`, formulas as their result.
- Old **.xls** files aren't supported; save them as .xlsx or CSV first.

## About Brady's library

Talking to the printer uses Brady's official [Web SDK](https://sdk.bradyid.com/). It is **not** part of this project and is not open source: `npm install` downloads it from npm, under [Brady's licence](https://www.npmjs.com/package/@bradycorporation/brady-web-sdk). Labelbench turns off the SDK's analytics, so nothing is sent anywhere.

The SDK prints images, so Labelbench draws each label itself (as SVG, then as a 300 dpi black-and-white bitmap) and sends those.

## For developers

```sh
npm test          # run the tests (Vitest)
npm run test:watch
```

There is no build step. The page loads plain ES modules straight from `src/`, with an import map pointing at the libraries in `node_modules`. `server.mjs` is a dependency-free static server that only serves the app's own files, on localhost only.

```
index.html           the page and import map
server.mjs           local web server
src/app.js           user interface and printing flow
src/printer.js       wrapper around Brady's SDK
src/part-editor.js   the text editor with column pills
src/render.js        text measuring, barcodes, SVG to printer bitmap
src/lib/             plain logic, covered by tests
  csv.js             CSV parsing and separator detection
  decode.js          UTF-8 / Windows-1252 decoding
  cells.js, xlsx.js  Excel cell values to text
  parts.js           label text as fixed text and column parts
  layout.js          label layout, as SVG in millimetres
  printer-size.js    label size from what the printer reports
  selection.js       row ranges, copies, batches
tests/               Vitest tests
```

## Known limits

- Only tested against a simulated printer so far; real-world batch speed over Bluetooth is unknown.
- Labels use the system's Helvetica (or Arial), since custom fonts can't be embedded offline in the same way.
- For continuous tape, the length is whatever you set; the printer only reports the tape width.

## Licence

Labelbench's own code is MIT licensed (see `LICENSE`). Brady's SDK, bwip-js and ExcelJS have their own licences.

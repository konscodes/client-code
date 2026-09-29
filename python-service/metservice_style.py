"""
Metservice compact DOCX layout — matched to issued samples
(kp/smeta/spec-22817_4-compact.docx): Verdana 8.5pt, gray-shaded header box,
zebra-striped item table, boxed right-aligned total, italic gray footnote.
"""
from docx import Document
from docx.shared import Pt, Mm, Twips, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from datetime import datetime
import re

# Reuse shared helpers from the main generator when imported as a package sibling.
# Fallback local copies keep this module importable from api/ as well.


# Colors and sizes taken from the issued samples
DARK_GRAY = '444444'   # company name, document number, totals
NOTE_GRAY = '666666'   # italic footnote
GRID_GRAY = '999999'   # item/total table borders
HEADER_FILL = 'F5F5F5'
TABLE_HEAD_FILL = 'E0E0E0'
ZEBRA_FILL = 'F7F7F7'
BASE_SIZE = 8.5


def _set_font(run, size=BASE_SIZE, bold=False, italic=False, color=None):
    run.font.name = 'Verdana'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'Verdana')
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def _spacing(paragraph, before=0, after=0):
    """Paragraph spacing in twips (as in the sample XML), single line spacing."""
    fmt = paragraph.paragraph_format
    fmt.space_before = Twips(before)
    fmt.space_after = Twips(after)
    fmt.line_spacing = 1.0


def _set_cell_margins(cell, top=0, left=0, bottom=0, right=0):
    """Per-cell padding in twips."""
    tcPr = cell._tc.get_or_add_tcPr()
    existing = tcPr.find(qn('w:tcMar'))
    if existing is not None:
        tcPr.remove(existing)
    mar = OxmlElement('w:tcMar')
    for edge, val in (('top', top), ('left', left), ('bottom', bottom), ('right', right)):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:w'), str(val))
        el.set(qn('w:type'), 'dxa')
        mar.append(el)
    tcPr.append(mar)


def _set_table_align_right(table):
    tblPr = table._tbl.tblPr
    jc = OxmlElement('w:jc')
    jc.set(qn('w:val'), 'right')
    tblPr.append(jc)


def _box_cell(cell, color=GRID_GRAY, sz='3'):
    _set_cell_border(cell, top=_thin_border(color, sz), left=_thin_border(color, sz),
                     bottom=_thin_border(color, sz), right=_thin_border(color, sz))


def _unboxed_cell(cell):
    _set_cell_border(cell, top=_no_border(), left=_no_border(), bottom=_no_border(), right=_no_border())


def _set_cell_border(cell, **kwargs):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    borders = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right'):
        edge_data = kwargs.get(edge)
        if edge_data:
            element = OxmlElement(f'w:{edge}')
            element.set(qn('w:val'), edge_data['val'])
            element.set(qn('w:sz'), str(edge_data.get('sz', 4)))
            element.set(qn('w:space'), '0')
            element.set(qn('w:color'), edge_data.get('color', 'auto'))
            borders.append(element)
    tcPr.append(borders)


def _set_table_borders(table, color='999999', sz='4'):
    tbl = table._tbl
    tblPr = tbl.tblPr
    if tblPr is None:
        tblPr = OxmlElement('w:tblPr')
        tbl.insert(0, tblPr)
    existing = tblPr.find(qn('w:tblBorders'))
    if existing is not None:
        tblPr.remove(existing)
    borders = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        element = OxmlElement(f'w:{edge}')
        element.set(qn('w:val'), 'single')
        element.set(qn('w:sz'), sz)
        element.set(qn('w:space'), '0')
        element.set(qn('w:color'), color)
        borders.append(element)
    tblPr.append(borders)


def _zero_para_spacing(paragraph):
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(0)
    fmt.space_after = Pt(0)
    fmt.line_spacing = 1.0


def _mm_to_dxa(mm):
    """Convert millimetres to Word DXA (twips)."""
    return int(mm * 56.7)


def _set_table_column_widths(table, widths_mm):
    """Force fixed layout + per-column widths (python-docx otherwise equalizes)."""
    table.autofit = False
    tbl = table._tbl
    tblPr = tbl.tblPr
    if tblPr is None:
        tblPr = OxmlElement('w:tblPr')
        tbl.insert(0, tblPr)

    # Fixed layout so Word respects our widths
    existing_layout = tblPr.find(qn('w:tblLayout'))
    if existing_layout is not None:
        tblPr.remove(existing_layout)
    layout = OxmlElement('w:tblLayout')
    layout.set(qn('w:type'), 'fixed')
    tblPr.append(layout)

    total_dxa = sum(_mm_to_dxa(w) for w in widths_mm)
    existing_w = tblPr.find(qn('w:tblW'))
    if existing_w is not None:
        tblPr.remove(existing_w)
    tblW = OxmlElement('w:tblW')
    tblW.set(qn('w:w'), str(total_dxa))
    tblW.set(qn('w:type'), 'dxa')
    tblPr.append(tblW)

    # Rebuild tblGrid
    existing_grid = tbl.find(qn('w:tblGrid'))
    if existing_grid is not None:
        tbl.remove(existing_grid)
    grid = OxmlElement('w:tblGrid')
    for w in widths_mm:
        gridCol = OxmlElement('w:gridCol')
        gridCol.set(qn('w:w'), str(_mm_to_dxa(w)))
        grid.append(gridCol)
    # tblGrid must sit after tblPr
    tblPr_index = list(tbl).index(tblPr)
    tbl.insert(tblPr_index + 1, grid)

    for row in table.rows:
        for idx, cell in enumerate(row.cells):
            if idx >= len(widths_mm):
                break
            cell.width = Mm(widths_mm[idx])
            tc = cell._tc
            tcPr = tc.get_or_add_tcPr()
            tcW = tcPr.find(qn('w:tcW'))
            if tcW is None:
                tcW = OxmlElement('w:tcW')
                tcPr.append(tcW)
            tcW.set(qn('w:w'), str(_mm_to_dxa(widths_mm[idx])))
            tcW.set(qn('w:type'), 'dxa')


def _set_cell_shading(cell, fill_hex='E8E8E8'):
    """Set cell background fill color (e.g. table header gray)."""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    existing = tcPr.find(qn('w:shd'))
    if existing is not None:
        tcPr.remove(existing)
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill_hex)
    tcPr.append(shd)


def _no_border():
    return {'val': 'nil', 'sz': '0', 'color': 'FFFFFF'}


def _thin_border(color='000000', sz='4'):
    return {'val': 'single', 'sz': sz, 'color': color}


def generate_metservice_document(data, doc_type, helpers=None):
    """Build Metservice compact layout document.

    `helpers` must be the host module (docx_generator / generate) exposing
    spell_money_russian, spell_number_russian, get_declension, WORKDAYS,
    format_date_full_russian, format_number_russian.
    """
    if helpers is None:
        raise ImportError('Metservice style requires helpers from the host document generator')
    spell_money_russian = helpers.spell_money_russian
    spell_number_russian = helpers.spell_number_russian
    get_declension = helpers.get_declension
    WORKDAYS = helpers.WORKDAYS
    format_date_full_russian = helpers.format_date_full_russian
    format_number_russian = helpers.format_number_russian

    doc = Document()
    for section in doc.sections:
        # Sample margins: 500 twips top/bottom, 560 twips left/right (Letter page)
        section.top_margin = Twips(500)
        section.bottom_margin = Twips(500)
        section.left_margin = Twips(560)
        section.right_margin = Twips(560)

    content_mm = 196  # full text width between margins
    style = doc.styles['Normal']
    style.font.name = 'Verdana'
    style.font.size = Pt(BASE_SIZE)
    style.paragraph_format.space_before = Pt(0)
    style.paragraph_format.space_after = Pt(0)
    style.paragraph_format.line_spacing = 1.0

    company = data.get('company', {})
    client = data.get('client', {})
    order = data.get('order', {})
    jobs = data.get('jobs', [])
    work_days = data.get('workCompletionDays', 30)

    # --- Company header box (gray fill, dark frame) ---
    header_table = doc.add_table(rows=1, cols=1)
    _set_table_column_widths(header_table, [content_mm])
    cell = header_table.cell(0, 0)
    border = {'val': 'single', 'sz': '8', 'color': DARK_GRAY}
    _set_cell_border(cell, top=border, left=border, bottom=border, right=border)
    _set_cell_shading(cell, HEADER_FILL)
    _set_cell_margins(cell, 200, 200, 200, 200)

    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _spacing(p, after=40)
    _set_font(p.add_run('ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ'), size=7.5, bold=True, color=DARK_GRAY)

    name = (company.get('name') or 'МЕТСЕРВИС').strip().strip('«»"')
    # Avoid duplicating ООО / legal form if already in name
    for prefix in ('ООО ', 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ '):
        if name.upper().startswith(prefix):
            name = name[len(prefix):].strip().strip('«»"')
    p = cell.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _spacing(p, after=120)
    _set_font(p.add_run(name), bold=True, color=DARK_GRAY)

    bank_parts = []
    if company.get('bankName'):
        bank_parts.append(company['bankName'])
    if company.get('bankAccount'):
        bank_parts.append(f"р/с {company['bankAccount']}")
    if company.get('correspondentAccount'):
        bank_parts.append(f"к/с {company['correspondentAccount']}")
    if company.get('bankBik'):
        bank_parts.append(f"БИК {company['bankBik']}")
    inn_parts = []
    if company.get('inn'):
        inn_parts.append(f"ИНН {company['inn']}")
    if company.get('kpp'):
        inn_parts.append(f"КПП {company['kpp']}")
    detail_lines = [company.get('address') or '', ', '.join(bank_parts), ', '.join(inn_parts)]
    detail_lines = [line for line in detail_lines if line]
    for i, line in enumerate(detail_lines):
        p = cell.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _spacing(p, after=80 if i < len(detail_lines) - 1 else 0)
        _set_font(p.add_run(line), size=7)

    _spacing(doc.add_paragraph(), before=160, after=100)

    # --- Doc number + client (left), date (right) ---
    if doc_type == 'invoice':
        doc_label = 'Смета №'
    elif doc_type == 'specification':
        doc_label = 'Спецификация №'
    else:
        doc_label = 'КП №'

    doc_number = (
        order.get('invoiceNumber')
        or order.get('poNumber')
        or re.sub(r'\D', '', str(order.get('id', '')))
    )

    order_date_str = order.get('date', '') or ''
    try:
        if ' ' in order_date_str:
            order_date_str = order_date_str.split()[0]
        order_date = datetime.strptime(order_date_str, '%Y-%m-%d') if order_date_str else datetime.now()
    except (ValueError, TypeError):
        order_date = datetime.now()
    date_formatted = format_date_full_russian(order_date.strftime('%Y-%m-%d'))

    meta = doc.add_table(rows=1, cols=2)
    _set_table_column_widths(meta, [content_mm / 2, content_mm / 2])
    left, right = meta.cell(0, 0), meta.cell(0, 1)
    for c in (left, right):
        _unboxed_cell(c)
    lp = left.paragraphs[0]
    _spacing(lp)
    _set_font(lp.add_run(f'{doc_label} {doc_number}'), size=9.5, bold=True, color=DARK_GRAY)

    client_name = (client.get('company') or client.get('name') or '').strip()
    if client_name and doc_type == 'invoice':
        cp = left.add_paragraph()
        _spacing(cp)
        _set_font(cp.add_run(f'для {client_name}'), size=7)

    rp = right.paragraphs[0]
    rp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    _spacing(rp)
    _set_font(rp.add_run(date_formatted))

    # Thin dark rule under the number/date line
    rule = doc.add_paragraph()
    _spacing(rule, after=160)
    pPr = rule._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '4')
    bottom.set(qn('w:space'), '4')
    bottom.set(qn('w:color'), DARK_GRAY)
    pBdr.append(bottom)
    pPr.append(pBdr)

    # --- Order title (left, bold 10pt) ---
    if order.get('orderTitle'):
        title = doc.add_paragraph()
        _spacing(title, before=200, after=200)
        _set_font(title.add_run(order['orderTitle']), size=10, bold=True)

    # --- Jobs table: gray header, zebra rows, thin gray grid ---
    job_rows = [j for j in jobs if (j.get('type') or 'job') != 'subcategory']
    table = doc.add_table(rows=1, cols=5)
    col_widths = [11.7, 107.8, 17.6, 29.45, 29.45]  # 196mm, proportions from the sample grid
    _set_table_column_widths(table, col_widths)
    _set_table_borders(table, color=GRID_GRAY, sz='3')

    tax_rate = float(order.get('taxRate', '0') or 0)
    tax = float(order.get('tax', '0') or 0)
    has_tax = tax_rate > 0 and tax > 0

    headers = ['№', 'Наименование', 'Кол-во', 'Стоимость', 'Сумма']
    head_aligns = [
        WD_ALIGN_PARAGRAPH.CENTER,
        WD_ALIGN_PARAGRAPH.LEFT,
        WD_ALIGN_PARAGRAPH.CENTER,
        WD_ALIGN_PARAGRAPH.CENTER,
        WD_ALIGN_PARAGRAPH.CENTER,
    ]
    for i, (text, align) in enumerate(zip(headers, head_aligns)):
        cell = table.rows[0].cells[i]
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        _set_cell_shading(cell, TABLE_HEAD_FILL)
        _set_cell_margins(cell, 100, 100, 100, 100)
        _box_cell(cell)
        p = cell.paragraphs[0]
        p.alignment = align
        _spacing(p)
        p.clear()
        _set_font(p.add_run(text), bold=True)

    body_aligns = [
        WD_ALIGN_PARAGRAPH.CENTER,
        WD_ALIGN_PARAGRAPH.LEFT,
        WD_ALIGN_PARAGRAPH.RIGHT,
        WD_ALIGN_PARAGRAPH.RIGHT,
        WD_ALIGN_PARAGRAPH.RIGHT,
    ]
    for idx, job in enumerate(job_rows, start=1):
        row = table.add_row()
        _set_table_column_widths(table, col_widths)

        qty = float(job.get('qty') or 0) or 0
        unit_raw = float(job.get('unitPrice', 0) or 0)
        line_total = float(job.get('lineTotal', 0) or 0)
        if qty > 0 and line_total > 0:
            unit_display = line_total / qty
        else:
            unit_display = unit_raw

        values = [
            str(idx),
            job.get('name') or '',
            str(job.get('qty') or ''),
            format_number_russian(unit_display),
            format_number_russian(line_total),
        ]
        for i, (val, align) in enumerate(zip(values, body_aligns)):
            cell = row.cells[i]
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            if idx % 2 == 0:
                _set_cell_shading(cell, ZEBRA_FILL)
            _set_cell_margins(cell, 90, 100, 90, 100)
            _box_cell(cell)
            p = cell.paragraphs[0]
            p.alignment = align
            _spacing(p)
            p.clear()
            _set_font(p.add_run(val))

    # --- Totals: separate half-width box aligned right ---
    total = float(order.get('total', '0') or 0)
    _spacing(doc.add_paragraph(), before=200)
    totals_lines = [('Итого с НДС:', total), (f'НДС ({tax_rate:g}%):', tax)] if has_tax else [('Итого:', total)]
    totals = doc.add_table(rows=len(totals_lines), cols=2)
    _set_table_column_widths(totals, [content_mm * 0.3, content_mm * 0.2])
    _set_table_align_right(totals)
    for row, (label, amount) in zip(totals.rows, totals_lines):
        for i, text in enumerate((label, format_number_russian(amount))):
            cell = row.cells[i]
            _set_cell_margins(cell, 90, 120, 90, 120)
            _box_cell(cell)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            _spacing(p)
            _set_font(p.add_run(text), bold=True, color=DARK_GRAY if i == 1 else None)

    # --- Cost line ---
    cost = doc.add_paragraph()
    _spacing(cost, before=240, after=100)
    if doc_type == 'specification':
        lead = 'Стоимость поставки составляет: '
    else:
        lead = 'Стоимость работ по заказу составляет: '
    if has_tax:
        tax_text = f' ({spell_money_russian(total)}) С НДС.'
    else:
        tax_text = (
            f' ({spell_money_russian(total)}). Без НДС. '
            f'Исполнитель применяет упрощенную систему налогообложения.'
        )
    _set_font(cost.add_run(f'{lead}{format_number_russian(total)} руб.{tax_text}'))

    # --- Deadlines ---
    days_word = spell_number_russian(work_days, False).capitalize()
    days_form = get_declension(work_days, WORKDAYS)
    deadline = doc.add_paragraph()
    _spacing(deadline, after=100)
    if doc_type == 'specification':
        dtext = (
            f'Срок поставки – {work_days} ({days_word}) {days_form} '
            f'с момента подписания спецификации и внесения предоплаты.'
        )
    else:
        dtext = (
            f'Срок выполнения работ – {work_days} ({days_word}) {days_form} '
            f'с момента внесения предоплаты и подписания сметы.'
        )
    _set_font(deadline.add_run(dtext))

    note = doc.add_paragraph()
    if doc_type == 'specification':
        _spacing(note, after=100)
        _set_font(note.add_run('Место поставки – склад поставщика.'))
    else:
        _spacing(note, after=260)
        _set_font(
            note.add_run(
                'Сроки могут быть увеличены по согласованию сторон, '
                'в случае проведения дополнительных работ.'
            ),
            size=7, italic=True, color=NOTE_GRAY,
        )

    # --- Footer ---
    footer = doc.add_table(rows=1, cols=2)
    fc0, fc1 = footer.cell(0, 0), footer.cell(0, 1)
    for c in (fc0, fc1):
        _unboxed_cell(c)

    if doc_type == 'po':
        _set_table_column_widths(footer, [content_mm * 0.6, content_mm * 0.4])
        for c in (fc0, fc1):
            _set_cell_margins(c, 160, 0, 0, 0)
        p = fc0.paragraphs[0]
        _spacing(p)
        _set_font(p.add_run('С уважением,'))
        p2 = fc0.add_paragraph()
        _spacing(p2)
        legal = company.get('legalName') or f"ООО {company.get('name', 'МЕТСЕРВИС')}"
        _set_font(p2.add_run(legal), bold=True, color=DARK_GRAY)
        fc1.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p3 = fc1.paragraphs[0]
        p3.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        _spacing(p3)
        if company.get('phone'):
            _set_font(p3.add_run(f"Тел: {company['phone']}"))
    else:
        _set_table_column_widths(footer, [content_mm / 2, content_mm / 2])
        for c, label in ((fc0, 'Исполнитель'), (fc1, 'Заказчик')):
            _set_cell_margins(c, 200, 0, 0, 0)
            p = c.paragraphs[0]
            _spacing(p)
            _set_font(p.add_run(label), bold=True)
            line = c.add_paragraph()
            _spacing(line, before=300)
            _set_font(line.add_run('________________/_________________/'))

    return doc

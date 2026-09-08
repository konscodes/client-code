"""
Metservice compact DOCX layout — matched to issued samples
(kp/smeta/spec-*-compact.docx): Verdana, tight header box, light gray tables.
"""
from docx import Document
from docx.shared import Pt, Mm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from datetime import datetime
import re

# Reuse shared helpers from the main generator when imported as a package sibling.
# Fallback local copies keep this module importable from api/ as well.


def _set_font(run, size=8.5, bold=False, italic=False):
    run.font.name = 'Verdana'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'Verdana')
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic


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
        # Match sample margins (~10mm / ~9mm)
        section.top_margin = Mm(9)
        section.bottom_margin = Mm(9)
        section.left_margin = Mm(10)
        section.right_margin = Mm(10)

    width = Mm(190)
    style = doc.styles['Normal']
    style.font.name = 'Verdana'
    style.font.size = Pt(7.5)
    style.paragraph_format.space_before = Pt(0)
    style.paragraph_format.space_after = Pt(0)
    style.paragraph_format.line_spacing = 1.0

    locale = data.get('locale', 'ru-RU')
    company = data.get('company', {})
    client = data.get('client', {})
    order = data.get('order', {})
    jobs = data.get('jobs', [])
    work_days = data.get('workCompletionDays', 30)

    # --- Company header box (full gray border) ---
    header_table = doc.add_table(rows=1, cols=1)
    _set_table_column_widths(header_table, [190])
    cell = header_table.cell(0, 0)
    _set_cell_border(
        cell,
        top={'val': 'single', 'sz': '8', 'color': '444444'},
        left={'val': 'single', 'sz': '8', 'color': '444444'},
        bottom={'val': 'single', 'sz': '8', 'color': '444444'},
        right={'val': 'single', 'sz': '8', 'color': '444444'},
    )

    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _zero_para_spacing(p)
    r = p.add_run('ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ')
    _set_font(r, size=7.5, bold=True)

    p2 = cell.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _zero_para_spacing(p2)
    name = (company.get('name') or 'МЕТСЕРВИС').strip().strip('«»')
    # Avoid duplicating ООО / legal form if already in name
    for prefix in ('ООО ', 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ '):
        if name.upper().startswith(prefix):
            name = name[len(prefix):].strip()
    r2 = p2.add_run(f'«{name}»')
    _set_font(r2, size=8.5, bold=True)

    if company.get('address'):
        p3 = cell.add_paragraph()
        p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _zero_para_spacing(p3)
        r3 = p3.add_run(company['address'])
        _set_font(r3, size=7.0)

    bank_parts = []
    if company.get('bankName'):
        bank_parts.append(company['bankName'])
    if company.get('bankAccount'):
        bank_parts.append(f"р/с {company['bankAccount']}")
    if company.get('correspondentAccount'):
        bank_parts.append(f"к/с {company['correspondentAccount']}")
    if company.get('bankBik'):
        bank_parts.append(f"БИК {company['bankBik']}")
    if bank_parts:
        p4 = cell.add_paragraph()
        p4.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _zero_para_spacing(p4)
        r4 = p4.add_run(', '.join(bank_parts))
        _set_font(r4, size=7.0)

    inn_parts = []
    if company.get('inn'):
        inn_parts.append(f"ИНН {company['inn']}")
    if company.get('kpp'):
        inn_parts.append(f"КПП {company['kpp']}")
    if inn_parts:
        p5 = cell.add_paragraph()
        p5.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _zero_para_spacing(p5)
        r5 = p5.add_run(', '.join(inn_parts))
        _set_font(r5, size=7.0)

    doc.add_paragraph()

    # --- Doc number + date + client ---
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
    _set_table_column_widths(meta, [120, 70])
    left = meta.cell(0, 0)
    right = meta.cell(0, 1)
    for c in (left, right):
        _set_cell_border(
            c,
            top=_no_border(),
            left=_no_border(),
            bottom=_no_border(),
            right=_no_border(),
        )
    lp = left.paragraphs[0]
    _zero_para_spacing(lp)
    lr = lp.add_run(f'{doc_label} {doc_number}')
    _set_font(lr, size=9.5, bold=True)

    client_name = (client.get('company') or client.get('name') or '').strip()
    if client_name:
        cp = left.add_paragraph()
        _zero_para_spacing(cp)
        cr = cp.add_run(f'для {client_name}')
        _set_font(cr, size=8.5)

    rp = right.paragraphs[0]
    rp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    _zero_para_spacing(rp)
    rr = rp.add_run(date_formatted)
    _set_font(rr, size=8.5, bold=True)

    # Thin rule under meta (like template)
    rule = doc.add_paragraph()
    _zero_para_spacing(rule)
    pPr = rule._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '6')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), '000000')
    pBdr.append(bottom)
    pPr.append(pBdr)

    doc.add_paragraph()

    # --- Order title (left, bold 10pt) ---
    if order.get('orderTitle'):
        title = doc.add_paragraph()
        title.alignment = WD_ALIGN_PARAGRAPH.LEFT
        _zero_para_spacing(title)
        tr = title.add_run(order['orderTitle'])
        _set_font(tr, size=10, bold=True)
        doc.add_paragraph()

    # --- Jobs table ---
    job_rows = [j for j in jobs if (j.get('type') or 'job') != 'subcategory']
    table = doc.add_table(rows=1, cols=5)
    col_widths = [12, 104, 18, 28, 28]  # 190mm total
    _set_table_column_widths(table, col_widths)
    _set_table_borders(table, color='000000', sz='4')

    tax_rate = float(order.get('taxRate', '0') or 0)
    tax = float(order.get('tax', '0') or 0)
    has_tax = tax_rate > 0 and tax > 0

    headers = ['№', 'Наименование', 'Кол-во', 'Стоимость', 'Сумма']
    aligns = [
        WD_ALIGN_PARAGRAPH.CENTER,
        WD_ALIGN_PARAGRAPH.CENTER,
        WD_ALIGN_PARAGRAPH.CENTER,
        WD_ALIGN_PARAGRAPH.CENTER,
        WD_ALIGN_PARAGRAPH.CENTER,
    ]
    for i, (text, align) in enumerate(zip(headers, aligns)):
        cell = table.rows[0].cells[i]
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        _set_cell_shading(cell, 'E8E8E8')
        p = cell.paragraphs[0]
        p.alignment = align
        _zero_para_spacing(p)
        p.clear()
        r = p.add_run(text)
        _set_font(r, size=7.5, bold=True)
        _set_cell_border(
            cell,
            top=_thin_border(),
            left=_thin_border(),
            bottom=_thin_border(),
            right=_thin_border(),
        )

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
        body_aligns = [
            WD_ALIGN_PARAGRAPH.CENTER,
            WD_ALIGN_PARAGRAPH.LEFT,
            WD_ALIGN_PARAGRAPH.CENTER,
            WD_ALIGN_PARAGRAPH.RIGHT,
            WD_ALIGN_PARAGRAPH.RIGHT,
        ]
        for i, (val, align) in enumerate(zip(values, body_aligns)):
            cell = row.cells[i]
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            p = cell.paragraphs[0]
            p.alignment = align
            _zero_para_spacing(p)
            p.clear()
            r = p.add_run(val)
            _set_font(r, size=7.5)
            _set_cell_border(
                cell,
                top=_thin_border(),
                left=_thin_border(),
                bottom=_thin_border(),
                right=_thin_border(),
            )

    # --- Totals: same 5 columns; only last 2 cells have visible borders ---
    total = float(order.get('total', '0') or 0)
    totals_rows = 2 if has_tax else 1
    totals = doc.add_table(rows=totals_rows, cols=5)
    _set_table_column_widths(totals, col_widths)
    # Disable outer table borders so only cell borders on cols 3–4 show
    _set_table_borders(totals, color='FFFFFF', sz='0')
    # Actually clear table-level borders
    tbl = totals._tbl
    tblPr = tbl.tblPr
    existing = tblPr.find(qn('w:tblBorders')) if tblPr is not None else None
    if existing is not None:
        tblPr.remove(existing)
    borders = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'nil')
        el.set(qn('w:sz'), '0')
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), 'auto')
        borders.append(el)
    tblPr.append(borders)

    def _fill_totals_row(row, label, amount, bold=True):
        for i in range(5):
            cell = row.cells[i]
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            p = cell.paragraphs[0]
            _zero_para_spacing(p)
            p.clear()
            if i < 3:
                _set_cell_border(
                    cell,
                    top=_no_border(),
                    left=_no_border(),
                    bottom=_no_border(),
                    right=_no_border(),
                )
            elif i == 3:
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                r = p.add_run(label)
                _set_font(r, size=7.5, bold=bold)
                _set_cell_border(
                    cell,
                    top=_thin_border(),
                    left=_thin_border(),
                    bottom=_thin_border(),
                    right=_thin_border(),
                )
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                r = p.add_run(format_number_russian(amount))
                _set_font(r, size=7.5, bold=bold)
                _set_cell_border(
                    cell,
                    top=_thin_border(),
                    left=_thin_border(),
                    bottom=_thin_border(),
                    right=_thin_border(),
                )

    if has_tax:
        _fill_totals_row(totals.rows[0], 'Итого с НДС:', total, bold=True)
        _fill_totals_row(totals.rows[1], f'НДС ({tax_rate}%):', tax, bold=False)
    else:
        _fill_totals_row(totals.rows[0], 'Итого:', total, bold=True)

    doc.add_paragraph()

    # --- Cost line ---
    cost = doc.add_paragraph()
    _zero_para_spacing(cost)
    if doc_type == 'specification':
        lead = 'Стоимость поставки составляет: '
    else:
        lead = 'Стоимость работ по заказу составляет: '
    r = cost.add_run(lead)
    _set_font(r, size=7.5)
    r2 = cost.add_run(f'{format_number_russian(total)} руб.')
    _set_font(r2, size=7.5)
    if has_tax:
        tax_text = f' ({spell_money_russian(total)}) С НДС.'
    else:
        tax_text = (
            f' ({spell_money_russian(total)}). Без НДС. '
            f'Исполнитель применяет упрощенную систему налогообложения.'
        )
    r3 = cost.add_run(tax_text)
    _set_font(r3, size=7.5)

    doc.add_paragraph()

    # --- Deadlines ---
    days_word = spell_number_russian(work_days, False).capitalize()
    days_form = get_declension(work_days, WORKDAYS)
    deadline = doc.add_paragraph()
    _zero_para_spacing(deadline)
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
    dr = deadline.add_run(dtext)
    _set_font(dr, size=7.5, bold=True)

    note = doc.add_paragraph()
    _zero_para_spacing(note)
    if doc_type == 'specification':
        nr = note.add_run('Место поставки – склад поставщика.')
        _set_font(nr, size=7.5)
    else:
        nr = note.add_run(
            'Сроки могут быть увеличены по согласованию сторон, '
            'в случае проведения дополнительных работ.'
        )
        _set_font(nr, size=7.0, italic=(doc_type == 'po'))

    doc.add_paragraph()
    doc.add_paragraph()

    # --- Footer ---
    footer = doc.add_table(rows=1, cols=2)
    _set_table_column_widths(footer, [100, 90])
    fc0, fc1 = footer.cell(0, 0), footer.cell(0, 1)
    for c in (fc0, fc1):
        _set_cell_border(
            c,
            top=_no_border(),
            left=_no_border(),
            bottom=_no_border(),
            right=_no_border(),
        )

    if doc_type == 'po':
        p = fc0.paragraphs[0]
        _zero_para_spacing(p)
        p.clear()
        r = p.add_run('С уважением,')
        _set_font(r, size=7.5)
        p2 = fc0.add_paragraph()
        _zero_para_spacing(p2)
        legal = company.get('legalName') or f"ООО {company.get('name', 'МЕТСЕРВИС')}"
        r2 = p2.add_run(legal)
        _set_font(r2, size=7.5, bold=True)
        p3 = fc1.paragraphs[0]
        p3.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        _zero_para_spacing(p3)
        p3.clear()
        if company.get('phone'):
            r3 = p3.add_run(f"Тел: {company['phone']}")
            _set_font(r3, size=7.5)
    else:
        p = fc0.paragraphs[0]
        _zero_para_spacing(p)
        p.clear()
        r = p.add_run('Исполнитель')
        _set_font(r, size=7.5, bold=True)
        p2 = fc0.add_paragraph()
        _zero_para_spacing(p2)
        r2 = p2.add_run('________________/_________________/')
        _set_font(r2, size=7.5)
        p3 = fc1.paragraphs[0]
        _zero_para_spacing(p3)
        p3.clear()
        r3 = p3.add_run('Заказчик')
        _set_font(r3, size=7.5, bold=True)
        p4 = fc1.add_paragraph()
        _zero_para_spacing(p4)
        r4 = p4.add_run('________________/_________________/')
        _set_font(r4, size=7.5)

    return doc

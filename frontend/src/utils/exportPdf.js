function sanitizeText(value) {
    return String(value ?? '').trim();
}

function sanitizeFileName(value) {
    const normalized = sanitizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || 'rentflow-export';
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight = 16) {
    const lines = doc.splitTextToSize(sanitizeText(text) || '-', maxWidth);
    doc.text(lines, x, y);
    return lines.length * lineHeight;
}

export async function exportDetailsToPdf({ title, subtitle = '', sections = [] }) {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
        compress: true,
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    const contentWidth = pageWidth - margin * 2;
    const labelWidth = 150;
    const valueWidth = contentWidth - labelWidth - 18;
    const rowPaddingY = 8;
    const rowLineHeight = 14;
    const sectionGap = 24;
    let cursorY = margin;

    const ensureSpace = (requiredHeight) => {
        if (cursorY + requiredHeight <= pageHeight - margin) {
            return;
        }
        doc.addPage();
        cursorY = margin;
    };

    const exportedAt = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.8);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(33, 37, 41);
    const titleHeight = addWrappedText(doc, title, margin, cursorY, contentWidth, 22);
    cursorY += titleHeight;

    if (subtitle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(90, 98, 104);
        const subtitleHeight = addWrappedText(doc, subtitle, margin, cursorY + 2, contentWidth, 15);
        cursorY += subtitleHeight + 6;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text(`Generated on ${exportedAt}`, margin, cursorY + 4);
    cursorY += 18;

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.6);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += sectionGap;

    sections.forEach((section) => {
        const fields = section.fields || [];
        ensureSpace(36);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(33, 37, 41);
        doc.text(sanitizeText(section.title) || 'Section', margin, cursorY);
        cursorY += 8;

        doc.setDrawColor(210, 210, 210);
        doc.setLineWidth(0.5);
        doc.line(margin, cursorY, pageWidth - margin, cursorY);
        cursorY += 12;

        if (fields.length === 0) {
            ensureSpace(24);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(110, 110, 110);
            doc.text('No details available.', margin, cursorY + 10);
            cursorY += 26 + sectionGap;
            return;
        }

        fields.forEach((field, index) => {
            const label = sanitizeText(field.label) || 'Field';
            const value = sanitizeText(field.value) || '-';
            const valueLines = doc.splitTextToSize(value, valueWidth);
            const rowHeight = Math.max(20, valueLines.length * rowLineHeight) + rowPaddingY * 2;

            ensureSpace(rowHeight + 4);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(70, 70, 70);
            doc.text(label, margin, cursorY + rowPaddingY + 10);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(33, 37, 41);
            doc.text(valueLines, margin + labelWidth + 18, cursorY + rowPaddingY + 10);

            cursorY += rowHeight;
            if (index < fields.length - 1) {
                doc.setDrawColor(225, 225, 225);
                doc.setLineWidth(0.4);
                doc.line(margin, cursorY, pageWidth - margin, cursorY);
                cursorY += 6;
            }
        });

        cursorY += sectionGap;
    });

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(210, 210, 210);
        doc.setLineWidth(0.4);
        doc.line(margin, pageHeight - 32, pageWidth - margin, pageHeight - 32);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(110, 110, 110);
        doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 18, { align: 'right' });
    }

    doc.save(`${sanitizeFileName(title)}.pdf`);
}

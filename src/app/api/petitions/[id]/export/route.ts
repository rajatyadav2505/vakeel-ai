import { eq } from 'drizzle-orm';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { deserializePetitionRow } from '@/lib/db/serializers';
import { petitions } from '@/lib/db/schema';
import { internalError } from '@/lib/api/responses';

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDbReady();
    const { id } = await context.params;

    const row = await db.select().from(petitions).where(eq(petitions.id, id)).limit(1);
    if (!row[0]) {
      return NextResponse.json({ error: 'Petition not found' }, { status: 404 });
    }

    const petition = deserializePetitionRow(row[0]);

    const sections = petition.content.sections
      .sort((a, b) => a.order - b.order)
      .flatMap((section) => [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun(section.heading)],
        }),
        new Paragraph(section.content),
      ]);

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              heading: HeadingLevel.TITLE,
              children: [new TextRun(petition.title)],
            }),
            ...sections,
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              children: [new TextRun('Prayer')],
            }),
            new Paragraph(petition.content.prayer),
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              children: [new TextRun('Verification')],
            }),
            new Paragraph(petition.content.verification),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${petition.title.replace(
          /[^a-z0-9-_]+/gi,
          '_'
        )}.docx"`,
      },
    });
  } catch (error) {
    return internalError('Failed to export petition', String(error));
  }
}

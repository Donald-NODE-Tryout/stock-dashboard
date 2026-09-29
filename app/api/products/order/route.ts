import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const orderFilePath = path.join(dataDir, 'custom_model_order.json');

export const dynamic = 'force-dynamic';

interface StoredOrderPayload {
  order: string[];
  mode?: 'custom' | 'company' | 'category';
  config?: any;
}

function getStoredData(): StoredOrderPayload {
  try {
    if (fs.existsSync(orderFilePath)) {
      const content = fs.readFileSync(orderFilePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return { order: parsed, mode: 'custom' };
      }
      if (parsed && typeof parsed === 'object') {
        return {
          order: Array.isArray(parsed.order) ? parsed.order : [],
          mode: parsed.mode || 'custom',
          config: parsed.config,
        };
      }
    }
  } catch (err) {
    console.error('Error reading custom model order file:', err);
  }
  return { order: [], mode: 'custom' };
}

function saveStoredData(data: StoredOrderPayload): boolean {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(orderFilePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving custom model order file:', err);
    return false;
  }
}

// GET /api/products/order - Retrieve the current persistent model order and mode
export async function GET() {
  const data = getStoredData();
  return NextResponse.json({
    order: data.order,
    mode: data.mode || 'custom',
    config: data.config,
  });
}

// POST /api/products/order - Update and persist custom model order and mode
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { order, mode = 'custom', config } = body;

    if (!Array.isArray(order)) {
      return NextResponse.json({ error: 'Order must be an array of model IDs.' }, { status: 400 });
    }

    const ok = saveStoredData({ order, mode, config });
    if (!ok) {
      return NextResponse.json({ error: 'Failed to write order file.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, order, mode, config });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error saving order';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/products/order - Reset to default database order
export async function DELETE() {
  try {
    if (fs.existsSync(orderFilePath)) {
      fs.unlinkSync(orderFilePath);
    }
    return NextResponse.json({ success: true, order: [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error resetting order';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

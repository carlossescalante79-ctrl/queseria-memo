import { neon } from '@neondatabase/serverless';

const connectionString =
  process.env.STORAGE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error('No se encontró STORAGE_URL, DATABASE_URL o POSTGRES_URL.');
}

const sql = neon(connectionString);

const num = v => Number(v ?? 0);

async function getData() {
  const [clients, products, providers, orders, orderItems, sales, saleItems, payments] =
    await Promise.all([
      sql`SELECT id, name, phone FROM clients ORDER BY name`,
      sql`SELECT id, name, sale_price, active FROM products WHERE active = TRUE ORDER BY name`,
      sql`SELECT id, name, phone FROM providers ORDER BY name`,
      sql`SELECT id, order_date, provider_id, provider_name, notes, total FROM orders ORDER BY order_date DESC, id DESC`,
      sql`SELECT id, order_id, product_id, product_name, quantity_kg, unit_cost, subtotal FROM order_items ORDER BY id`,
      sql`SELECT id, sale_date, client_id, client_name, payment_status, total, paid_amount, pending_amount, notes FROM sales ORDER BY sale_date DESC, id DESC`,
      sql`SELECT id, sale_id, product_id, product_name, quantity, unit_price, subtotal FROM sale_items ORDER BY id`,
      sql`SELECT id, client_id, sale_id, payment_date, amount, notes FROM payments ORDER BY payment_date DESC, id DESC`
    ]);

  const orderItemsByOrder = new Map();
  for (const i of orderItems) {
    const key = Number(i.order_id);
    if (!orderItemsByOrder.has(key)) orderItemsByOrder.set(key, []);
    orderItemsByOrder.get(key).push({
      id:Number(i.id),
      productId:i.product_id ? Number(i.product_id) : null,
      product:i.product_name,
      qty:num(i.quantity_kg),
      cost:num(i.unit_cost),
      subtotal:num(i.subtotal)
    });
  }

  const saleItemsBySale = new Map();
  for (const i of saleItems) {
    const key = Number(i.sale_id);
    if (!saleItemsBySale.has(key)) saleItemsBySale.set(key, []);
    saleItemsBySale.get(key).push({
      id:Number(i.id),
      productId:i.product_id ? Number(i.product_id) : null,
      product:i.product_name,
      qty:num(i.quantity),
      price:num(i.unit_price),
      subtotal:num(i.subtotal)
    });
  }

  return {
    ok:true,
    clients:clients.map(c=>({id:Number(c.id),name:c.name,phone:c.phone||''})),
    products:products.map(p=>({id:Number(p.id),name:p.name,price:num(p.sale_price)})),
    providers:providers.map(p=>({id:Number(p.id),name:p.name,phone:p.phone||''})),
    orders:orders.map(o=>({
      id:Number(o.id),
      date:String(o.order_date).slice(0,10),
      providerId:o.provider_id ? Number(o.provider_id) : null,
      provider:o.provider_name || 'Sin proveedor',
      notes:o.notes||'',
      total:num(o.total),
      items:orderItemsByOrder.get(Number(o.id))||[]
    })),
    sales:sales.map(s=>({
      id:Number(s.id),
      date:String(s.sale_date).slice(0,10),
      clientId:s.client_id ? Number(s.client_id) : null,
      client:s.client_name,
      concept:s.client_name,
      paymentStatus:s.payment_status,
      amount:num(s.total),
      paidAmount:num(s.paid_amount),
      pendingAmount:num(s.pending_amount),
      note:s.notes||'',
      items:saleItemsBySale.get(Number(s.id))||[]
    })),
    payments:payments.map(p=>({
      id:Number(p.id),
      clientId:p.client_id ? Number(p.client_id) : null,
      saleId:p.sale_id ? Number(p.sale_id) : null,
      date:String(p.payment_date).slice(0,10),
      amount:num(p.amount),
      note:p.notes||''
    }))
  };
}

async function findProductId(name) {
  const rows = await sql`SELECT id FROM products WHERE lower(name)=lower(${name}) LIMIT 1`;
  return rows[0] ? Number(rows[0].id) : null;
}

async function findProvider(name) {
  const rows = await sql`SELECT id FROM providers WHERE lower(name)=lower(${name}) LIMIT 1`;
  return rows[0] ? Number(rows[0].id) : null;
}

async function ensureClient(name) {
  let rows = await sql`SELECT id FROM clients WHERE lower(name)=lower(${name}) LIMIT 1`;
  if (rows[0]) return Number(rows[0].id);
  rows = await sql`INSERT INTO clients (name) VALUES (${name}) RETURNING id`;
  return Number(rows[0].id);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json(await getData());
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ok:false,error:'Método no permitido'});
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body||'{}') : (req.body||{});
    const action = body.action;

    if (action === 'createClient') {
      const name = String(body.name||'').trim();
      if (!name) throw new Error('El nombre del cliente es obligatorio.');
      const exists = await sql`SELECT id FROM clients WHERE lower(name)=lower(${name}) LIMIT 1`;
      if (exists[0]) throw new Error('Ese cliente ya está registrado.');
      const rows = await sql`INSERT INTO clients (name, phone) VALUES (${name}, ${String(body.phone||'')}) RETURNING id`;
      return res.status(200).json({ok:true,id:Number(rows[0].id)});
    }

    if (action === 'updateClient') {
      await sql`UPDATE clients SET phone=${String(body.phone||'')}, updated_at=NOW() WHERE id=${Number(body.id)}`;
      return res.status(200).json({ok:true});
    }

    if (action === 'deleteClient') {
      await sql`DELETE FROM clients WHERE id=${Number(body.id)}`;
      return res.status(200).json({ok:true});
    }

    if (action === 'createProduct') {
      const name=String(body.name||'').trim();
      const price=num(body.price);
      if (!name) throw new Error('El producto es obligatorio.');
      const rows=await sql`
        INSERT INTO products (name,sale_price,active)
        VALUES (${name},${price},TRUE)
        ON CONFLICT (name) DO UPDATE SET sale_price=EXCLUDED.sale_price, active=TRUE, updated_at=NOW()
        RETURNING id`;
      return res.status(200).json({ok:true,id:Number(rows[0].id)});
    }

    if (action === 'updateProduct') {
      await sql`UPDATE products SET sale_price=${num(body.price)}, updated_at=NOW() WHERE id=${Number(body.id)}`;
      return res.status(200).json({ok:true});
    }

    if (action === 'deleteProduct') {
      await sql`UPDATE products SET active=FALSE, updated_at=NOW() WHERE id=${Number(body.id)}`;
      return res.status(200).json({ok:true});
    }

    if (action === 'createProvider') {
      const name=String(body.name||'').trim();
      if (!name) throw new Error('El proveedor es obligatorio.');
      const rows=await sql`INSERT INTO providers (name,phone) VALUES (${name},${String(body.phone||'')}) RETURNING id`;
      return res.status(200).json({ok:true,id:Number(rows[0].id)});
    }

    if (action === 'createOrder') {
      const date=String(body.date||'');
      const provider=String(body.provider||'Sin proveedor');
      const notes=String(body.notes||'');
      const items=Array.isArray(body.items)?body.items:[];
      if (!items.length) throw new Error('El pedido no tiene productos.');
      const total=items.reduce((s,i)=>s+num(i.qty)*num(i.cost),0);
      const providerId=await findProvider(provider);

      const rows=await sql`
        INSERT INTO orders (order_date,provider_id,provider_name,notes,total)
        VALUES (${date},${providerId},${provider},${notes},${total})
        RETURNING id`;
      const orderId=Number(rows[0].id);

      for (const i of items) {
        const productId=await findProductId(i.product);
        const subtotal=num(i.qty)*num(i.cost);
        await sql`
          INSERT INTO order_items
          (order_id,product_id,product_name,quantity_kg,unit_cost,subtotal)
          VALUES (${orderId},${productId},${String(i.product)},${num(i.qty)},${num(i.cost)},${subtotal})`;
      }
      return res.status(200).json({ok:true,id:orderId});
    }

    if (action === 'deleteOrder') {
      await sql`DELETE FROM orders WHERE id=${Number(body.id)}`;
      return res.status(200).json({ok:true});
    }

    if (action === 'createSale') {
      const date=String(body.date||'');
      const items=Array.isArray(body.items)?body.items:[];
      if (!items.length) throw new Error('La venta no tiene productos.');

      let clientId = body.clientId ? Number(body.clientId) : null;
      let client = String(body.client||body.newClientName||'').trim();
      if (!client) throw new Error('El cliente es obligatorio.');
      if (!clientId) clientId=await ensureClient(client);

      const total=items.reduce((s,i)=>s+num(i.qty)*num(i.price),0);
      const status=['paid','partial','pending'].includes(body.paymentStatus) ? body.paymentStatus : 'paid';
      let paid=num(body.paidAmount);
      if (status==='paid') paid=total;
      if (status==='pending') paid=0;
      paid=Math.max(0,Math.min(total,paid));
      const pending=Math.max(0,total-paid);

      const rows=await sql`
        INSERT INTO sales
        (sale_date,client_id,client_name,payment_status,total,paid_amount,pending_amount,notes)
        VALUES (${date},${clientId},${client},${status},${total},${paid},${pending},${String(body.note||'')})
        RETURNING id`;
      const saleId=Number(rows[0].id);

      for (const i of items) {
        const productId=await findProductId(i.product);
        const subtotal=num(i.qty)*num(i.price);
        await sql`
          INSERT INTO sale_items
          (sale_id,product_id,product_name,quantity,unit_price,subtotal)
          VALUES (${saleId},${productId},${String(i.product)},${num(i.qty)},${num(i.price)},${subtotal})`;
      }

      return res.status(200).json({ok:true,id:saleId,clientId});
    }

    return res.status(400).json({ok:false,error:'Acción no reconocida.'});
  } catch (error) {
    console.error(error);
    return res.status(500).json({ok:false,error:error.message||'Error interno'});
  }
}

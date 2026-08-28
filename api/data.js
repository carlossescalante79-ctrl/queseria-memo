import { neon } from '@neondatabase/serverless';

const connectionString=process.env.STORAGE_URL||process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!connectionString) throw new Error('No se encontró la conexión de Neon.');
const sql=neon(connectionString);
const num=v=>Number(v??0);

async function getData(){
  const [clients,products,providers,orders,orderItems,sales,saleItems,payments]=await Promise.all([
    sql`SELECT id,name,phone,route FROM clients ORDER BY name`,
    sql`SELECT id,name,sale_price,active FROM products WHERE active=TRUE ORDER BY name`,
    sql`SELECT id,name,phone FROM providers ORDER BY name`,
    sql`SELECT id,order_date,provider_id,provider_name,notes,total FROM orders ORDER BY order_date DESC,id DESC`,
    sql`SELECT id,order_id,product_id,product_name,quantity_kg,unit_cost,subtotal FROM order_items ORDER BY id`,
    sql`SELECT id,sale_date,client_id,client_name,payment_status,total,paid_amount,pending_amount,notes FROM sales ORDER BY sale_date DESC,id DESC`,
    sql`SELECT id,sale_id,product_id,product_name,quantity,unit_price,subtotal FROM sale_items ORDER BY id`,
    sql`SELECT id,client_id,sale_id,payment_date,amount,notes FROM payments ORDER BY payment_date DESC,id DESC`
  ]);

  const oi=new Map(),si=new Map();
  orderItems.forEach(i=>{const k=Number(i.order_id);if(!oi.has(k))oi.set(k,[]);oi.get(k).push({id:Number(i.id),productId:i.product_id?Number(i.product_id):null,product:i.product_name,qty:num(i.quantity_kg),cost:num(i.unit_cost),subtotal:num(i.subtotal)})});
  saleItems.forEach(i=>{const k=Number(i.sale_id);if(!si.has(k))si.set(k,[]);si.get(k).push({id:Number(i.id),productId:i.product_id?Number(i.product_id):null,product:i.product_name,qty:num(i.quantity),price:num(i.unit_price),subtotal:num(i.subtotal)})});

  return {
    ok:true,
    clients:clients.map(c=>({id:Number(c.id),name:c.name,phone:c.phone||'',route:c.route||''})),
    products:products.map(p=>({id:Number(p.id),name:p.name,price:num(p.sale_price)})),
    providers:providers.map(p=>({id:Number(p.id),name:p.name,phone:p.phone||''})),
    orders:orders.map(o=>({id:Number(o.id),date:String(o.order_date).slice(0,10),providerId:o.provider_id?Number(o.provider_id):null,provider:o.provider_name||'Sin proveedor',notes:o.notes||'',total:num(o.total),items:oi.get(Number(o.id))||[]})),
    sales:sales.map(s=>({id:Number(s.id),date:String(s.sale_date).slice(0,10),clientId:s.client_id?Number(s.client_id):null,client:s.client_name,concept:s.client_name,paymentStatus:s.payment_status,amount:num(s.total),paidAmount:num(s.paid_amount),pendingAmount:num(s.pending_amount),note:s.notes||'',items:si.get(Number(s.id))||[]})),
    payments:payments.map(p=>({id:Number(p.id),clientId:p.client_id?Number(p.client_id):null,saleId:p.sale_id?Number(p.sale_id):null,date:String(p.payment_date).slice(0,10),amount:num(p.amount),note:p.notes||''}))
  };
}

async function findProductId(name){const r=await sql`SELECT id FROM products WHERE lower(name)=lower(${name}) LIMIT 1`;return r[0]?Number(r[0].id):null}
async function findProvider(name){const r=await sql`SELECT id FROM providers WHERE lower(name)=lower(${name}) LIMIT 1`;return r[0]?Number(r[0].id):null}
async function ensureClient(name,route=''){
  let r=await sql`SELECT id FROM clients WHERE lower(name)=lower(${name}) LIMIT 1`;
  if(r[0]) return Number(r[0].id);
  const valid=['monday','tuesday'].includes(route)?route:null;
  r=await sql`INSERT INTO clients(name,route) VALUES(${name},${valid}) RETURNING id`;
  return Number(r[0].id);
}

export default async function handler(req,res){
  try{
    if(req.method==='GET'){res.setHeader('Cache-Control','no-store');return res.status(200).json(await getData())}
    if(req.method!=='POST') return res.status(405).json({ok:false,error:'Método no permitido'});
    const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const a=b.action;

    if(a==='createClient'){
      const name=String(b.name||'').trim(); if(!name) throw new Error('El nombre es obligatorio.');
      const route=['monday','tuesday'].includes(b.route)?b.route:null;
      const e=await sql`SELECT id FROM clients WHERE lower(name)=lower(${name}) LIMIT 1`;
      if(e[0]) throw new Error('Ese cliente ya está registrado.');
      const r=await sql`INSERT INTO clients(name,phone,route) VALUES(${name},${String(b.phone||'')},${route}) RETURNING id`;
      return res.status(200).json({ok:true,id:Number(r[0].id)});
    }
    if(a==='updateClient'){await sql`UPDATE clients SET phone=${String(b.phone||'')},updated_at=NOW() WHERE id=${Number(b.id)}`;return res.status(200).json({ok:true})}
    if(a==='updateClientRoute'){const route=['monday','tuesday'].includes(b.route)?b.route:null;await sql`UPDATE clients SET route=${route},updated_at=NOW() WHERE id=${Number(b.id)}`;return res.status(200).json({ok:true})}
    if(a==='deleteClient'){await sql`DELETE FROM clients WHERE id=${Number(b.id)}`;return res.status(200).json({ok:true})}

    if(a==='createProduct'){const name=String(b.name||'').trim();const price=num(b.price);const r=await sql`INSERT INTO products(name,sale_price,active) VALUES(${name},${price},TRUE) ON CONFLICT(name) DO UPDATE SET sale_price=EXCLUDED.sale_price,active=TRUE,updated_at=NOW() RETURNING id`;return res.status(200).json({ok:true,id:Number(r[0].id)})}
    if(a==='updateProduct'){await sql`UPDATE products SET sale_price=${num(b.price)},updated_at=NOW() WHERE id=${Number(b.id)}`;return res.status(200).json({ok:true})}
    if(a==='deleteProduct'){await sql`UPDATE products SET active=FALSE,updated_at=NOW() WHERE id=${Number(b.id)}`;return res.status(200).json({ok:true})}
    if(a==='createProvider'){const r=await sql`INSERT INTO providers(name,phone) VALUES(${String(b.name||'')},${String(b.phone||'')}) RETURNING id`;return res.status(200).json({ok:true,id:Number(r[0].id)})}

    if(a==='createOrder'){
      const items=Array.isArray(b.items)?b.items:[];const total=items.reduce((s,i)=>s+num(i.qty)*num(i.cost),0);const provider=String(b.provider||'Sin proveedor');const providerId=await findProvider(provider);
      const r=await sql`INSERT INTO orders(order_date,provider_id,provider_name,notes,total) VALUES(${String(b.date||'')},${providerId},${provider},${String(b.notes||'')},${total}) RETURNING id`;
      const id=Number(r[0].id);
      for(const i of items){const productId=await findProductId(i.product);await sql`INSERT INTO order_items(order_id,product_id,product_name,quantity_kg,unit_cost,subtotal) VALUES(${id},${productId},${String(i.product)},${num(i.qty)},${num(i.cost)},${num(i.qty)*num(i.cost)})`}
      return res.status(200).json({ok:true,id});
    }
    if(a==='deleteOrder'){await sql`DELETE FROM orders WHERE id=${Number(b.id)}`;return res.status(200).json({ok:true})}

    if(a==='createSale'){
      const items=Array.isArray(b.items)?b.items:[];let clientId=b.clientId?Number(b.clientId):null;const client=String(b.client||b.newClientName||'').trim();
      if(!clientId) clientId=await ensureClient(client,String(b.newClientRoute||''));
      const total=items.reduce((s,i)=>s+num(i.qty)*num(i.price),0);
      let status=['paid','partial','pending'].includes(b.paymentStatus)?b.paymentStatus:'paid',paid=num(b.paidAmount);
      if(status==='paid')paid=total;if(status==='pending')paid=0;paid=Math.max(0,Math.min(total,paid));status=paid>=total?'paid':paid>0?'partial':'pending';const pending=Math.max(0,total-paid);
      const r=await sql`INSERT INTO sales(sale_date,client_id,client_name,payment_status,total,paid_amount,pending_amount,notes) VALUES(${String(b.date||'')},${clientId},${client},${status},${total},${paid},${pending},${String(b.note||'')}) RETURNING id`;
      const id=Number(r[0].id);
      for(const i of items){const productId=await findProductId(i.product);await sql`INSERT INTO sale_items(sale_id,product_id,product_name,quantity,unit_price,subtotal) VALUES(${id},${productId},${String(i.product)},${num(i.qty)},${num(i.price)},${num(i.qty)*num(i.price)})`}
      return res.status(200).json({ok:true,id,clientId});
    }

    if(a==='createPayment'){
      const clientId=Number(b.clientId||0);let amount=num(b.amount);const date=String(b.date||new Date().toISOString().slice(0,10));const note=String(b.note||'');
      const open=await sql`SELECT id,pending_amount FROM sales WHERE client_id=${clientId} AND pending_amount>0 ORDER BY sale_date ASC,id ASC`;
      if(!open.length) throw new Error('Este cliente no tiene saldo pendiente.');
      amount=Math.min(amount,open.reduce((s,r)=>s+num(r.pending_amount),0));let rem=amount,applied=0;
      for(const s of open){if(rem<=0)break;const x=Math.min(num(s.pending_amount),rem),np=Math.max(0,num(s.pending_amount)-x);await sql`UPDATE sales SET pending_amount=${np},paid_amount=paid_amount+${x},payment_status=${np<=0?'paid':'partial'},updated_at=NOW() WHERE id=${Number(s.id)}`;await sql`INSERT INTO payments(client_id,sale_id,payment_date,amount,notes) VALUES(${clientId},${Number(s.id)},${date},${x},${note})`;rem-=x;applied+=x}
      return res.status(200).json({ok:true,applied});
    }

    return res.status(400).json({ok:false,error:'Acción no reconocida.'});
  }catch(e){console.error(e);return res.status(500).json({ok:false,error:e.message||'Error interno'})}
}

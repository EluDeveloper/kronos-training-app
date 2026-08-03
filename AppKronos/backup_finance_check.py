import json
from datetime import datetime

with open('AppKronos/Backup/kronos_backup_20260803.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

athletes = data.get('atletas', {})
this_year = 2026
this_month = 8

# Caja chica y banco del mes actual y acumulado del año
caja = 0.0
banco = 0.0
caja_ytd = 0.0
banco_ytd = 0.0
for atleta in athletes.values():
    hp = atleta.get('historial_pagos') or {}
    for year, ym in hp.items():
        if str(year) != str(this_year):
            continue
        for mes, pago in ym.items():
            if not pago or pago.get('estatus') != 'Pagado':
                continue
            fecha = pago.get('fecha_aplicacion')
            if not fecha:
                continue
            try:
                d = datetime.fromisoformat(fecha.replace('Z', '+00:00'))
            except Exception:
                continue
            if d.year != this_year:
                continue
            amt = 0.0
            try:
                amt = float(pago.get('monto_real_pagado') or 0)
            except Exception:
                amt = 0.0
            if amt <= 0 and atleta.get('membresia'):
                try:
                    amt = float(atleta['membresia'].get('monto_pagado') or 0)
                except Exception:
                    amt = 0.0
            if amt <= 0:
                continue
            if pago.get('tipo_pago') == 'Efectivo':
                if d.month == this_month:
                    caja += amt
                caja_ytd += amt
            elif pago.get('tipo_pago') == 'Transferencia':
                if d.month == this_month:
                    banco += amt
                banco_ytd += amt

# Ingresos y costos anuales
ingreso_membresias = 0.0
ingreso_tienda = 0.0
costo_ventas = 0.0
egresos = 0.0

for atleta in athletes.values():
    hp = atleta.get('historial_pagos') or {}
    for year, ym in hp.items():
        if str(year) != str(this_year):
            continue
        for mes, pago in ym.items():
            if not pago or pago.get('estatus') != 'Pagado' or not pago.get('fecha_aplicacion'):
                continue
            try:
                d = datetime.fromisoformat(pago['fecha_aplicacion'].replace('Z', '+00:00'))
            except Exception:
                continue
            if d.year != this_year:
                continue
            amt = 0.0
            try:
                amt = float(pago.get('monto_real_pagado') or 0)
            except Exception:
                amt = 0.0
            if amt <= 0 and atleta.get('membresia'):
                try:
                    amt = float(atleta['membresia'].get('monto_pagado') or 0)
                except Exception:
                    amt = 0.0
            ingreso_membresias += amt

for venta in data.get('tienda_ventas') or []:
    if not venta or venta.get('estatus') == 'Cancelado':
        continue
    ft = venta.get('fecha_transaccion')
    if not ft:
        continue
    try:
        d = datetime.fromisoformat(ft.replace('Z', '+00:00'))
    except Exception:
        continue
    if d.year != this_year:
        continue

    total = 0.0
    abonos = venta.get('abonos') or []
    if abonos:
        total_abonos = 0.0
        for abono in abonos:
            if not abono or not abono.get('fecha'):
                continue
            try:
                da = datetime.fromisoformat(abono['fecha'].replace('Z', '+00:00'))
            except Exception:
                continue
            if da.year == this_year:
                total_abonos += float(abono.get('monto') or 0)
        if total_abonos > 0:
            total = total_abonos
    if total <= 0:
        if venta.get('estatus') == 'Liquidado':
            total = float(venta.get('total_pagar') or 0)
        elif venta.get('estatus') == 'Lo debe':
            total = float(venta.get('monto_recibido') or 0)
    ingreso_tienda += total

    items = venta.get('items') or []
    if items:
        for item in items:
            prod = data.get('tienda_productos', {}).get(item.get('id_producto'))
            if prod:
                costo_ventas += float(item.get('cantidad') or 0) * float(prod.get('costo_unitario') or 0)
    elif venta.get('id_producto'):
        prod = data.get('tienda_productos', {}).get(venta.get('id_producto'))
        if prod:
            costo_ventas += float(venta.get('cantidad') or 1) * float(prod.get('costo_unitario') or 0)

for eg in data.get('egresos') or []:
    if not eg or eg.get('estado') != 'Pagado' or not eg.get('fecha'):
        continue
    try:
        d = datetime.strptime(eg['fecha'], '%Y-%m-%d')
    except Exception:
        continue
    if d.year == this_year:
        egresos += float(eg.get('monto') or 0)

resultado = (ingreso_membresias + ingreso_tienda) - (egresos + costo_ventas)
print('CAJA_CHICA_AUG_2026=' + str(round(caja, 2)))
print('CUENTA_BANCO_AUG_2026=' + str(round(banco, 2)))
print('CAJA_CHICA_ENE_HOY_2026=' + str(round(caja_ytd, 2)))
print('CUENTA_BANCO_ENE_HOY_2026=' + str(round(banco_ytd, 2)))
print('TOTAL_INGRESO_MEMBRESIAS_AUG_2026=' + str(round(caja + banco, 2)))
print('INGRESO_MEMBRESIAS_2026=' + str(round(ingreso_membresias, 2)))
print('INGRESO_TIENDA_2026=' + str(round(ingreso_tienda, 2)))
print('COSTO_VENTAS_2026=' + str(round(costo_ventas, 2)))
print('EGRESOS_2026=' + str(round(egresos, 2)))
print('RESULTADO_OPERATIVO_EST_2026=' + str(round(resultado, 2)))
print('GANANCIA_TIENDA_2026=' + str(round(ingreso_tienda - costo_ventas, 2)))

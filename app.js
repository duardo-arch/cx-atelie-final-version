// ============================================================
// Fio & Caixa — lógica do sistema (JavaScript puro, sem JSX)
// Usa React.createElement diretamente, por isso não precisa
// de Babel/Vite/Node para rodar. Basta abrir o index.html.
// ============================================================
var e = React.createElement;

// ---------- helpers ----------
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
// Formata uma data no fuso horário LOCAL (não UTC) como yyyy-mm-dd.
// Usar toISOString() aqui causava o bug do dia errado à noite, porque ele
// sempre converte para UTC (Brasil fica 3h atrás, então à noite o UTC já
// virou o dia seguinte).
function dateToStr(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}
function todayStr() { return dateToStr(new Date()); }
function fmtBRL(n) { return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtDate(d) {
  var parts = d.split("-");
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

var ENTRADA_CATS = ["Venda de peça", "Serviço de costura", "Ajuste/Reforma", "Sinal de encomenda", "Outro"];
var SAIDA_CATS = ["Compra de material", "Conta/Despesa", "Frete", "Outro"];
var PAYMENTS = ["Dinheiro", "PIX", "Cartão débito", "Cartão crédito", "Fiado"];

// Dados salvos no localStorage do navegador (só neste computador/navegador).
var KEYS = { tx: "atelier-transactions", clients: "atelier-clients", products: "atelier-products", stock: "atelier-inventory", orcamentos: "atelier-orcamentos" };

function safeGet(key) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Erro ao ler localStorage", err);
    return [];
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error("Erro ao salvar no localStorage", err);
  }
}

// dispara o download de um arquivo de texto (CSV ou JSON) direto no navegador
function downloadFile(filename, content, mime) {
  var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function csvEscape(val) {
  var s = val === null || val === undefined ? "" : String(val);
  if (s.indexOf(",") !== -1 || s.indexOf("\"") !== -1 || s.indexOf("\n") !== -1) {
    s = "\"" + s.replace(/"/g, "\"\"") + "\"";
  }
  return s;
}

function toCSV(rows, headers) {
  var lines = [headers.map(function (h) { return csvEscape(h.label); }).join(",")];
  rows.forEach(function (row) {
    lines.push(headers.map(function (h) { return csvEscape(h.get(row)); }).join(","));
  });
  return lines.join("\n");
}

// Copia texto pra área de transferência. Tenta a API moderna e cai para o
// método antigo (execCommand) quando o arquivo é aberto direto (file://),
// onde a API moderna costuma não funcionar.
function copyText(text, onDone) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { onDone(true); }).catch(function () { fallbackCopy(text, onDone); });
  } else {
    fallbackCopy(text, onDone);
  }
}
function fallbackCopy(text, onDone) {
  try {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = document.execCommand("copy");
    document.body.removeChild(ta);
    onDone(!!ok);
  } catch (err) {
    onDone(false);
  }
}

// pequeno helper para ícones (emoji em vez de biblioteca externa, pra não depender de bundler)
function Icon(symbol, size, color) {
  return e("span", { style: { fontSize: size || 16, lineHeight: 1, display: "inline-flex", color: color || "inherit", verticalAlign: "middle" } }, symbol);
}

// ---------- pequenos componentes de UI ----------
function Stitch(props) {
  var className = (props && props.className) || "";
  return e("div", { className: "stitch " + className });
}

function Modal(props) {
  // O fundo escurecido não fecha mais o card ao clicar fora — só o "X" ou uma
  // ação explícita (Salvar, Cancelar) fazem isso, pra evitar perder dados sem querer.
  return e("div", { className: "modal-backdrop" },
    e("div", { className: "modal-card" },
      e("div", { className: "modal-head" },
        e("span", { className: "font-display", style: { fontSize: 20 } }, props.title),
        e("button", { className: "icon-btn", onClick: props.onClose }, Icon("✕", 18))
      ),
      e(Stitch, {}),
      e("div", { style: { padding: "18px 22px 22px" } }, props.children)
    )
  );
}

function Field(props) {
  return e("label", { style: { display: "block", marginBottom: 14 } },
    e("span", { className: "field-label" }, props.label),
    props.children
  );
}

function Empty(props) {
  return e("div", { className: "empty-state" },
    e("div", { style: { fontSize: 28 } }, props.icon),
    e("p", null, props.text)
  );
}

// Modal genérico de confirmação, usado antes de editar/excluir qualquer registro.
function ConfirmModal(props) {
  return e(Modal, { title: props.title || "Confirmar ação", onClose: props.onCancel },
    e("p", { style: { fontSize: 14, color: "var(--ink)", marginBottom: 20, lineHeight: 1.5 } }, props.message),
    e("div", { style: { display: "flex", gap: 10 } },
      e("button", { type: "button", className: "btn btn-outline", style: { flex: 1, justifyContent: "center" }, onClick: props.onCancel }, "Cancelar"),
      e("button", { type: "button", className: "btn " + (props.danger ? "btn-danger-solid" : "btn-primary"), style: { flex: 1, justifyContent: "center" }, onClick: props.onConfirm }, props.confirmLabel || "Confirmar")
    )
  );
}

// ---------- app principal ----------
function App() {
  var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo;

  var tabS = useState("caixa"); var tab = tabS[0], setTab = tabS[1];
  var txS = useState([]); var transactions = txS[0], setTransactions = txS[1];
  var clientsS = useState([]); var clients = clientsS[0], setClients = clientsS[1];
  var productsS = useState([]); var products = productsS[0], setProducts = productsS[1];
  var stockS = useState([]); var inventory = stockS[0], setInventory = stockS[1];
  var orcS = useState([]); var orcamentos = orcS[0], setOrcamentos = orcS[1];

  useEffect(function () {
    setTransactions(safeGet(KEYS.tx));
    setClients(safeGet(KEYS.clients));
    setProducts(safeGet(KEYS.products));
    setInventory(safeGet(KEYS.stock));
    setOrcamentos(safeGet(KEYS.orcamentos));
  }, []);

  function persistTx(list) { setTransactions(list); safeSet(KEYS.tx, list); }
  function persistClients(list) { setClients(list); safeSet(KEYS.clients, list); }
  function persistProducts(list) { setProducts(list); safeSet(KEYS.products, list); }
  function persistStock(list) { setInventory(list); safeSet(KEYS.stock, list); }
  function persistOrcamentos(list) { setOrcamentos(list); safeSet(KEYS.orcamentos, list); }

  var TABS = [
    { id: "caixa", label: "Caixa", icon: "💲" },
    { id: "orcamentos", label: "Orçamentos", icon: "🧾" },
    { id: "clientes", label: "Clientes", icon: "👥" },
    { id: "produtos", label: "Produtos & Serviços", icon: "👕" },
    { id: "estoque", label: "Estoque", icon: "📦" },
    { id: "relatorios", label: "Relatórios", icon: "📊" }
  ];

  var todayTx = useMemo(function () {
    return transactions.filter(function (t) { return t.date === todayStr(); });
  }, [transactions]);
  var saldoHoje = useMemo(function () {
    return todayTx.reduce(function (s, t) { return s + (t.type === "entrada" ? t.value : -t.value); }, 0);
  }, [todayTx]);

  return e("div", { className: "app-root" },
    e("div", { className: "header" },
      e("div", { className: "brand" },
        e("div", { className: "brand-icon" }, Icon("", 19, "#fff")),
        e("div", null,
          e("div", { className: "brand-title font-display" }, "Ateliê Rita Dicassia"),
          e("div", { className: "brand-sub" }, "caixa")
        )
      ),
      e("div", { className: "balance-pill" },
        e("div", { className: "label" }, "Saldo de hoje"),
        e("div", { className: "value", style: { color: saldoHoje >= 0 ? "var(--teal-dark)" : "var(--brick)" } }, fmtBRL(saldoHoje))
      )
    ),
    e("div", { className: "tabs" },
      TABS.map(function (t) {
        return e("button", {
          key: t.id,
          className: "tab-btn " + (tab === t.id ? "active" : ""),
          onClick: function () { setTab(t.id); }
        }, Icon(t.icon, 15), " " + t.label);
      })
    ),
    e("div", { className: "content" },
      tab === "caixa" ? e(CaixaTab, { transactions: transactions, persistTx: persistTx, clients: clients, products: products, persistProducts: persistProducts }) : null,
      tab === "orcamentos" ? e(OrcamentosTab, { orcamentos: orcamentos, persistOrcamentos: persistOrcamentos, clients: clients, products: products, persistProducts: persistProducts, transactions: transactions, persistTx: persistTx }) : null,
      tab === "clientes" ? e(ClientesTab, { clients: clients, persistClients: persistClients, transactions: transactions }) : null,
      tab === "produtos" ? e(ProdutosTab, { products: products, persistProducts: persistProducts }) : null,
      tab === "estoque" ? e(EstoqueTab, { inventory: inventory, persistStock: persistStock }) : null,
      tab === "relatorios" ? e(RelatoriosTab, {
        transactions: transactions, clients: clients, products: products, inventory: inventory,
        persistTx: persistTx, persistClients: persistClients, persistProducts: persistProducts, persistStock: persistStock
      }) : null
    )
  );
}

// ---------- CAIXA ----------
// Ajusta o estoque de um produto (quando ele tem controle de estoque ativado).
// amount: valor a somar ao estoque (negativo para dar baixa na venda, positivo para devolver).
function applyStockEffect(products, itemId, amount) {
  if (!itemId || !amount) return products;
  return products.map(function (p) {
    if (p.id === itemId && p.type === "produto" && p.controlaEstoque) {
      var novaQtd = +((p.estoqueQtd || 0) + amount).toFixed(3);
      return Object.assign({}, p, { estoqueQtd: Math.max(0, novaQtd) });
    }
    return p;
  });
}

// Aplica o efeito de estoque de vários itens de uma vez (um lançamento pode ter mais de um produto).
// direction: -1 para dar baixa (venda), +1 para devolver (edição/exclusão).
function applyStockEffectsForItems(products, items, direction) {
  var result = products;
  (items || []).forEach(function (it) {
    if (it.itemId) result = applyStockEffect(result, it.itemId, direction * (parseFloat(it.qty) || 0));
  });
  return result;
}

var QTY_UNITS = ["unidade", "metro", "kg", "rolo"];
var UNIT_LABELS = { unidade: "un", metro: "m", kg: "kg", rolo: "rolo" };

function emptyMeta(date) {
  return { type: "entrada", category: ENTRADA_CATS[0], payment: PAYMENTS[0], clientId: "", date: date, notes: "" };
}
function newCaixaRow() {
  return { rowId: uid(), itemId: "", description: "", qty: "1", unit: "unidade", price: "0" };
}

function CaixaTab(props) {
  var transactions = props.transactions, persistTx = props.persistTx, clients = props.clients, products = props.products, persistProducts = props.persistProducts;
  var useState = React.useState;
  var showFormS = useState(false); var showForm = showFormS[0], setShowForm = showFormS[1];
  var filterDateS = useState(todayStr()); var filterDate = filterDateS[0], setFilterDate = filterDateS[1];
  var errorS = useState(""); var error = errorS[0], setError = errorS[1];
  var editingIdS = useState(null); var editingId = editingIdS[0], setEditingId = editingIdS[1];
  var confirmS = useState(null); var confirm = confirmS[0], setConfirm = confirmS[1];
  var metaS = useState(emptyMeta(todayStr())); var meta = metaS[0], setMeta = metaS[1];
  var rowsS = useState([newCaixaRow()]); var rows = rowsS[0], setRows = rowsS[1];
  var searchS = useState(""); var productSearch = searchS[0], setProductSearch = searchS[1];

  var dayTx = transactions.filter(function (t) { return t.date === filterDate; })
    .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  var entradas = dayTx.filter(function (t) { return t.type === "entrada"; }).reduce(function (s, t) { return s + t.value; }, 0);
  var saidas = dayTx.filter(function (t) { return t.type === "saida"; }).reduce(function (s, t) { return s + t.value; }, 0);

  var computedRows = rows.map(function (r) {
    var qty = parseFloat(r.qty) || 0;
    var price = parseFloat(r.price) || 0;
    return Object.assign({}, r, { subtotal: qty * price });
  });
  var total = computedRows.reduce(function (s, r) { return s + r.subtotal; }, 0);
  var filteredProducts = productSearch.trim()
    ? products.filter(function (p) { return p.name.toLowerCase().indexOf(productSearch.trim().toLowerCase()) !== -1; })
    : products;

  function openNew() {
    setMeta(emptyMeta(todayStr()));
    setRows([newCaixaRow()]);
    setEditingId(null);
    setError("");
    setProductSearch("");
    setShowForm(true);
  }

  // reconstrói as linhas a partir de um lançamento existente (compatível com
  // lançamentos antigos, salvos antes de existir suporte a múltiplos itens).
  function rowsFromTx(t) {
    if (t.items && t.items.length) {
      return t.items.map(function (it) {
        return { rowId: uid(), itemId: it.itemId || "", description: it.description, qty: String(it.qty), unit: it.unit || "unidade", price: String(it.price) };
      });
    }
    if (t.itemId || t.description) {
      return [{ rowId: uid(), itemId: t.itemId || "", description: t.description || "", qty: t.qty !== undefined ? String(t.qty) : "1", unit: t.qtyUnit || "unidade", price: t.value !== undefined ? String(t.value / (t.qty || 1)) : "0" }];
    }
    return [newCaixaRow()];
  }

  function openEdit(t) {
    setMeta({ type: t.type, category: t.category, payment: t.payment, clientId: t.clientId || "", date: t.date, notes: t.notes || "" });
    setRows(rowsFromTx(t));
    setEditingId(t.id);
    setError("");
    setShowForm(true);
  }

  function addRow() { setRows(rows.concat([newCaixaRow()])); }
  function removeRow(rowId) {
    if (rows.length === 1) { setRows([newCaixaRow()]); return; }
    setRows(rows.filter(function (r) { return r.rowId !== rowId; }));
  }
  function updateRow(rowId, changes) {
    setRows(rows.map(function (r) { return r.rowId === rowId ? Object.assign({}, r, changes) : r; }));
    if (error) setError("");
  }
  function pickProduct(rowId, itemId) {
    var item = products.find(function (p) { return p.id === itemId; });
    if (!item) { updateRow(rowId, { itemId: "" }); return; }
    var row = rows.find(function (r) { return r.rowId === rowId; });
    var qty = row && parseFloat(row.qty) > 0 ? row.qty : "1";
    updateRow(rowId, { itemId: itemId, description: item.name, price: String(item.price), unit: item.unidade || "unidade", qty: qty });
    // sugere a categoria com base no primeiro item escolhido, se ainda estiver no padrão
    if ((meta.category === ENTRADA_CATS[0]) || meta.category === "") {
      setMeta(Object.assign({}, meta, { category: item.type === "produto" ? "Venda de peça" : "Serviço de costura" }));
    }
  }

  // usado ao clicar num resultado da lista de busca: preenche uma linha vazia
  // existente, ou cria uma nova linha já com o produto escolhido.
  function selectFromSearch(item) {
    var emptyRow = rows.find(function (r) { return !r.description.trim() && !r.itemId; });
    if (emptyRow) {
      pickProduct(emptyRow.rowId, item.id);
    } else {
      setRows(rows.concat([Object.assign(newCaixaRow(), { itemId: item.id, description: item.name, price: String(item.price), unit: item.unidade || "unidade" })]));
      if ((meta.category === ENTRADA_CATS[0]) || meta.category === "") {
        setMeta(Object.assign({}, meta, { category: item.type === "produto" ? "Venda de peça" : "Serviço de costura" }));
      }
    }
    setProductSearch("");
  }

  function submit(ev) {
    ev.preventDefault();
    var algumPreenchido = rows.some(function (r) { return r.description.trim(); });
    if (!algumPreenchido) { setError("Adicione ao menos um item ou descrição."); return; }
    if (total <= 0) { setError("O total precisa ser maior que zero."); return; }
    var qtyInvalida = computedRows.some(function (r) { return r.description.trim() && (!r.qty || parseFloat(r.qty) <= 0); });
    if (qtyInvalida) { setError("Informe uma quantidade válida em todos os itens."); return; }

    if (editingId) {
      setConfirm({
        message: "Confirma as alterações neste lançamento?",
        confirmLabel: "Salvar alterações",
        onConfirm: function () { doSave(); setConfirm(null); }
      });
    } else {
      doSave();
    }
  }

  function doSave() {
    var client = clients.find(function (c) { return c.id === meta.clientId; });
    var itemsValidos = computedRows.filter(function (r) { return r.description.trim(); }).map(function (r) {
      return { itemId: r.itemId || null, description: r.description.trim(), qty: parseFloat(r.qty) || 1, unit: r.unit, price: parseFloat(r.price) || 0, subtotal: r.subtotal };
    });
    var totalCalc = itemsValidos.reduce(function (s, r) { return s + r.subtotal; }, 0);
    var combinedDescription = itemsValidos.map(function (r) { return r.description; }).join(" + ");

    var txData = {
      type: meta.type, category: meta.category, description: combinedDescription,
      value: totalCalc, payment: meta.payment, clientId: meta.clientId || null,
      clientName: client ? client.name : null, items: itemsValidos, date: meta.date, notes: meta.notes ? meta.notes.trim() : ""
    };

    if (editingId) {
      var oldTx = transactions.find(function (t) { return t.id === editingId; });
      var oldItems = oldTx ? (oldTx.items && oldTx.items.length ? oldTx.items : (oldTx.itemId ? [{ itemId: oldTx.itemId, qty: oldTx.qty || 1 }] : [])) : [];
      var afterRevert = oldTx && oldTx.type === "entrada" ? applyStockEffectsForItems(products, oldItems, 1) : products;
      var afterApply = txData.type === "entrada" ? applyStockEffectsForItems(afterRevert, txData.items, -1) : afterRevert;
      persistProducts(afterApply);
      persistTx(transactions.map(function (t) { return t.id === editingId ? Object.assign({}, t, txData) : t; }));
    } else {
      var tx = Object.assign({ id: uid(), createdAt: Date.now() }, txData);
      if (txData.type === "entrada") {
        persistProducts(applyStockEffectsForItems(products, txData.items, -1));
      }
      persistTx([tx].concat(transactions));
    }

    setFilterDate(meta.date);
    setShowForm(false);
    setEditingId(null);
  }

  function requestRemove(t) {
    var multi = t.items && t.items.length > 1;
    setConfirm({
      message: "Excluir o lançamento \"" + t.description + "\"? Essa ação não pode ser desfeita." + ((t.items && t.items.some(function (it) { return it.itemId; })) ? " O estoque " + (multi ? "dos itens será devolvido." : "do item será devolvido.") : ""),
      confirmLabel: "Excluir",
      danger: true,
      onConfirm: function () { remove(t); setConfirm(null); }
    });
  }

  function remove(t) {
    if (t.type === "entrada") {
      var items = t.items && t.items.length ? t.items : (t.itemId ? [{ itemId: t.itemId, qty: t.qty || 1 }] : []);
      persistProducts(applyStockEffectsForItems(products, items, 1));
    }
    persistTx(transactions.filter(function (x) { return x.id !== t.id; }));
  }

  return e("div", null,
    e("div", { className: "stat-grid" },
      e("div", { className: "stat-card" },
        e("div", { className: "stat-label" }, Icon("↑", 14, "var(--teal-dark)"), " Entradas"),
        e("div", { className: "stat-value", style: { color: "var(--teal-dark)" } }, fmtBRL(entradas))
      ),
      e("div", { className: "stat-card" },
        e("div", { className: "stat-label" }, Icon("↓", 14, "var(--brick)"), " Saídas"),
        e("div", { className: "stat-value", style: { color: "var(--brick)" } }, fmtBRL(saidas))
      ),
      e("div", { className: "stat-card" },
        e("div", { className: "stat-label" }, "Saldo do dia"),
        e("div", { className: "stat-value" }, fmtBRL(entradas - saidas))
      )
    ),
    e("div", { className: "card" },
      e("div", { className: "list-head" },
        e("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
          Icon("📅", 15, "var(--ink-soft)"),
          e("input", { type: "date", value: filterDate, onChange: function (ev) { setFilterDate(ev.target.value); }, style: { width: 150 } })
        ),
        e("button", { className: "btn btn-primary", onClick: openNew }, Icon("+", 15), " Lançamento")
      ),
      e(Stitch, { style: { margin: "14px 0" } }),
      dayTx.length === 0 ?
        e(Empty, { icon: "💲", text: "Nenhum lançamento neste dia ainda." }) :
        e("table", null,
          e("thead", null, e("tr", null,
            e("th", null, "Descrição"), e("th", null, "Categoria"), e("th", null, "Pagamento"),
            e("th", null, "Cliente"), e("th", null, "Valor"), e("th", null, "")
          )),
          e("tbody", null,
            dayTx.map(function (t) {
              var multi = t.items && t.items.length > 1;
              var single = t.items && t.items.length === 1 ? t.items[0] : null;
              return e("tr", { key: t.id },
                e("td", null,
                  e("span", { className: "badge " + (t.type === "entrada" ? "badge-entrada" : "badge-saida"), style: { marginRight: 8 } }, t.type === "entrada" ? "Entrada" : "Saída"),
                  t.description,
                  multi ? e("span", { style: { color: "var(--ink-soft)", fontSize: 12 } }, " · " + t.items.length + " itens") : null,
                  single && single.qty ? e("span", { style: { color: "var(--ink-soft)", fontSize: 12 } }, " · " + single.qty + " " + (UNIT_LABELS[single.unit] || single.unit || "un")) : null,
                  t.notes ? e("span", { title: t.notes, style: { marginLeft: 6, cursor: "help" } }, "📝") : null
                ),
                e("td", null, t.category),
                e("td", null, t.payment),
                e("td", null, t.clientName || "—"),
                e("td", { className: "font-mono", style: { color: t.type === "entrada" ? "var(--teal-dark)" : "var(--brick)", fontWeight: 600 } },
                  (t.type === "entrada" ? "+" : "-") + fmtBRL(t.value)
                ),
                e("td", null,
                  e("div", { style: { display: "flex", gap: 4 } },
                    e("button", { className: "icon-btn", onClick: function () { openEdit(t); } }, Icon("✎", 15)),
                    e("button", { className: "icon-btn", onClick: function () { requestRemove(t); } }, Icon("🗑", 15))
                  )
                )
              );
            })
          )
        )
    ),
    showForm ? e(Modal, { title: editingId ? "Editar lançamento" : "Novo lançamento", onClose: function () { setShowForm(false); setEditingId(null); } },
      e("form", { onSubmit: submit },
        e("div", { className: "type-toggle" },
          e("button", { type: "button", className: meta.type === "entrada" ? "sel-entrada" : "", onClick: function () { setMeta(Object.assign({}, meta, { type: "entrada", category: ENTRADA_CATS[0] })); } }, Icon("↑", 15), " Entrada"),
          e("button", { type: "button", className: meta.type === "saida" ? "sel-saida" : "", onClick: function () { setMeta(Object.assign({}, meta, { type: "saida", category: SAIDA_CATS[0] })); setRows(rows.map(function (r) { return Object.assign({}, r, { itemId: "" }); })); } }, Icon("↓", 15), " Saída")
        ),

        meta.type === "entrada" ? e(Field, { label: "Buscar produto cadastrado" },
          e("div", { className: "search-box", style: { marginBottom: 0 } },
            Icon("🔍", 14, "var(--ink-soft)"),
            e("input", { value: productSearch, onChange: function (ev) { setProductSearch(ev.target.value); }, placeholder: "Digite o nome do produto ou serviço..." })
          )
        ) : null,

        meta.type === "entrada" && productSearch.trim() ? e("div", { className: "search-results" },
          filteredProducts.length === 0 ?
            e("div", { className: "search-results-empty" }, "Nenhum produto encontrado para \"" + productSearch + "\".") :
            filteredProducts.map(function (p) {
              var tag = p.type === "produto" ? " (" + (UNIT_LABELS[p.unidade] || "un") + ")" : " (serviço)";
              return e("button", { type: "button", key: p.id, className: "search-result-item", onClick: function () { selectFromSearch(p); } },
                e("span", null, p.name + tag),
                e("span", { className: "font-mono" }, fmtBRL(p.price))
              );
            })
        ) : null,

        e("div", { style: { marginBottom: 6, marginTop: meta.type === "entrada" ? 14 : 0 } },
          computedRows.map(function (r, idx) {
            return e("div", { key: r.rowId, className: "orc-row" },
              e("div", { className: "orc-row-main" },
                meta.type === "entrada" ? e(Field, { label: idx === 0 ? "Item cadastrado" : "" },
                  e("select", { value: r.itemId, onChange: function (ev) { pickProduct(r.rowId, ev.target.value); } },
                    [e("option", { key: "none", value: "" }, "Item avulso (digite abaixo)")].concat(
                      filteredProducts.map(function (p) {
                        var tag = p.type === "produto" ? " (" + (UNIT_LABELS[p.unidade] || "un") + ")" : " (serviço)";
                        return e("option", { key: p.id, value: p.id }, p.name + " — " + fmtBRL(p.price) + tag);
                      })
                    )
                  )
                ) : null,
                e(Field, { label: idx === 0 ? "Descrição" : "" },
                  e("input", {
                    value: r.description,
                    onChange: function (ev) { updateRow(r.rowId, { description: ev.target.value }); },
                    placeholder: meta.type === "entrada" ? "Ex: Vestido sob medida" : "Ex: Compra de linha e zíper",
                    readOnly: !!r.itemId,
                    style: r.itemId ? { background: "var(--linen)", color: "var(--ink-soft)" } : null
                  })
                )
              ),
              e("div", { className: "orc-row-nums" },
                e(Field, { label: idx === 0 ? "Qtd." : "" },
                  e("input", {
                    type: "number", step: r.unit === "unidade" ? "1" : "0.01", min: r.unit === "unidade" ? "1" : "0",
                    value: r.qty,
                    onChange: function (ev) {
                      var v = ev.target.value;
                      if (r.unit === "unidade") v = v.replace(/[^\d]/g, "");
                      updateRow(r.rowId, { qty: v });
                    }
                  })
                ),
                e(Field, { label: idx === 0 ? "Un." : "" },
                  e("select", { value: r.unit, onChange: function (ev) { updateRow(r.rowId, { unit: ev.target.value }); }, disabled: !!r.itemId },
                    QTY_UNITS.map(function (u) { return e("option", { key: u, value: u }, UNIT_LABELS[u]); })
                  )
                ),
                e(Field, { label: idx === 0 ? "Preço unit." : "" },
                  e("input", { type: "number", step: "0.01", min: "0", value: r.price, onChange: function (ev) { updateRow(r.rowId, { price: ev.target.value }); }, readOnly: !!r.itemId, style: r.itemId ? { background: "var(--linen)", color: "var(--ink-soft)" } : null })
                ),
                e("div", { className: "orc-row-sub" },
                  idx === 0 ? e("span", { className: "field-label" }, "Subtotal") : null,
                  e("div", { className: "font-mono", style: { fontWeight: 600, paddingTop: idx === 0 ? 0 : 9 } }, fmtBRL(r.subtotal))
                ),
                e("button", { type: "button", className: "icon-btn", style: { marginTop: idx === 0 ? 22 : 0 }, onClick: function () { removeRow(r.rowId); } }, Icon("🗑", 15))
              )
            );
          })
        ),
        e("button", { type: "button", className: "btn btn-outline btn-sm", style: { marginBottom: 14 }, onClick: addRow }, Icon("+", 13), " Adicionar produto"),

        e("div", { className: "row" },
          e(Field, { label: "Categoria" },
            e("select", { value: meta.category, onChange: function (ev) { setMeta(Object.assign({}, meta, { category: ev.target.value })); } },
              (meta.type === "entrada" ? ENTRADA_CATS : SAIDA_CATS).map(function (c) { return e("option", { key: c }, c); })
            )
          ),
          e(Field, { label: "Forma de pagamento" },
            e("select", { value: meta.payment, onChange: function (ev) { setMeta(Object.assign({}, meta, { payment: ev.target.value })); } },
              PAYMENTS.map(function (p) { return e("option", { key: p }, p); })
            )
          )
        ),
        e(Field, { label: "Data" },
          e("div", { style: { padding: "9px 11px", background: "var(--linen)", borderRadius: 8, fontSize: 14, color: "var(--ink-soft)" } },
            Icon("📅", 13), " " + fmtDate(meta.date) + (editingId ? "" : "")
          )
        ),
        meta.type === "entrada" ? e(Field, { label: "Cliente (opcional)" },
          e("select", { value: meta.clientId, onChange: function (ev) { setMeta(Object.assign({}, meta, { clientId: ev.target.value })); } },
            [e("option", { key: "none", value: "" }, "Sem cliente vinculado")].concat(
              clients.map(function (c) { return e("option", { key: c.id, value: c.id }, c.name); })
            )
          )
        ) : null,
        e(Field, { label: "Observações (opcional)" },
          e("textarea", { rows: 2, value: meta.notes, onChange: function (ev) { setMeta(Object.assign({}, meta, { notes: ev.target.value })); }, placeholder: "Alguma observação sobre esse lançamento..." })
        ),

        e(Stitch, { style: { margin: "14px 0" } }),
        e("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 } },
          e("div", { className: "font-display", style: { fontSize: 16 } }, "Total"),
          e("div", { className: "font-mono", style: { fontSize: 20, fontWeight: 600 } }, fmtBRL(total))
        ),

        error ? e("div", { className: "form-error" }, error) : null,
        e("button", { type: "submit", className: "btn btn-primary", style: { width: "100%", justifyContent: "center" } }, editingId ? "Salvar alterações" : "Salvar lançamento")
      )
    ) : null,
    confirm ? e(ConfirmModal, { message: confirm.message, confirmLabel: confirm.confirmLabel, danger: confirm.danger, onConfirm: confirm.onConfirm, onCancel: function () { setConfirm(null); } }) : null
  );
}

// ---------- CLIENTES ----------
function ClientesTab(props) {
  var clients = props.clients, persistClients = props.persistClients, transactions = props.transactions;
  var useState = React.useState;
  var searchS = useState(""); var search = searchS[0], setSearch = searchS[1];
  var editingS = useState(null); var editing = editingS[0], setEditing = editingS[1];
  var expandedS = useState(null); var expanded = expandedS[0], setExpanded = expandedS[1];
  var formS = useState({ name: "", phone: "", measurements: "", notes: "" });
  var form = formS[0], setForm = formS[1];
  var errorS = useState(""); var error = errorS[0], setError = errorS[1];
  var confirmS = useState(null); var confirm = confirmS[0], setConfirm = confirmS[1];

  var filtered = clients.filter(function (c) { return c.name.toLowerCase().indexOf(search.toLowerCase()) !== -1; });

  function openNew() { setForm({ name: "", phone: "", measurements: "", notes: "" }); setError(""); setEditing("new"); }
  function openEdit(c) { setForm(c); setError(""); setEditing(c.id); }

  function submit(ev) {
    ev.preventDefault();
    if (!form.name.trim()) { setError("Digite o nome do cliente."); return; }
    if (editing !== "new") {
      setConfirm({
        message: "Confirma as alterações no cadastro de \"" + form.name + "\"?",
        confirmLabel: "Salvar alterações",
        onConfirm: function () { doSave(); setConfirm(null); }
      });
    } else {
      doSave();
    }
  }

  function doSave() {
    if (editing === "new") {
      persistClients([Object.assign({}, form, { id: uid() })].concat(clients));
    } else {
      persistClients(clients.map(function (c) { return c.id === editing ? Object.assign({}, form, { id: editing }) : c; }));
    }
    setEditing(null);
  }

  function requestRemove(c) {
    setConfirm({
      message: "Excluir o cliente \"" + c.name + "\"? O histórico de compras dele deixará de aparecer vinculado a um cliente. Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      danger: true,
      onConfirm: function () { remove(c.id); setConfirm(null); }
    });
  }
  function remove(id) { persistClients(clients.filter(function (c) { return c.id !== id; })); }

  function historyFor(clientId) {
    return transactions.filter(function (t) { return t.clientId === clientId; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  return e("div", null,
    e("div", { className: "card" },
      e("div", { className: "list-head" },
        e("div", { className: "search-box", style: { marginBottom: 0, flex: 1, maxWidth: 320 } },
          Icon("🔍", 15, "var(--ink-soft)"),
          e("input", { placeholder: "Buscar cliente...", value: search, onChange: function (ev) { setSearch(ev.target.value); } })
        ),
        e("button", { className: "btn btn-primary", onClick: openNew }, Icon("+", 15), " Cliente")
      ),
      e(Stitch, { style: { margin: "14px 0" } }),
      filtered.length === 0 ?
        e(Empty, { icon: "👥", text: "Nenhum cliente cadastrado ainda." }) :
        filtered.map(function (c) {
          return e("div", { key: c.id, style: { borderBottom: "1px solid var(--line)", padding: "12px 2px" } },
            e("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }, onClick: function () { setExpanded(expanded === c.id ? null : c.id); } },
              e("div", null,
                e("div", { style: { fontWeight: 600 } }, c.name),
                e("div", { style: { fontSize: 12.5, color: "var(--ink-soft)" } }, c.phone || "Sem telefone")
              ),
              e("div", { style: { display: "flex", gap: 4, alignItems: "center" } },
                e("button", { className: "icon-btn", onClick: function (ev) { ev.stopPropagation(); openEdit(c); } }, Icon("✎", 15)),
                e("button", { className: "icon-btn", onClick: function (ev) { ev.stopPropagation(); requestRemove(c); } }, Icon("🗑", 15)),
                e("span", { style: { display: "inline-block", transform: expanded === c.id ? "rotate(180deg)" : "none", transition: "transform .15s" } }, Icon("▾", 16))
              )
            ),
            expanded === c.id ? e("div", { style: { marginTop: 10, fontSize: 13, color: "var(--ink-soft)" } },
              c.measurements ? e("div", { style: { marginBottom: 6 } }, e("b", { style: { color: "var(--ink)" } }, "Medidas: "), c.measurements) : null,
              c.notes ? e("div", { style: { marginBottom: 10 } }, e("b", { style: { color: "var(--ink)" } }, "Observações: "), c.notes) : null,
              e("b", { style: { color: "var(--ink)" } }, "Histórico:"),
              historyFor(c.id).length === 0 ? e("div", null, "Nenhuma compra registrada.") :
                e("ul", { style: { margin: "6px 0 0", paddingLeft: 18 } },
                  historyFor(c.id).map(function (t) {
                    return e("li", { key: t.id }, fmtDate(t.date) + " — " + t.description + " — ", e("span", { className: "font-mono" }, fmtBRL(t.value)));
                  })
                )
            ) : null
          );
        })
    ),
    editing ? e(Modal, { title: editing === "new" ? "Novo cliente" : "Editar cliente", onClose: function () { setEditing(null); } },
      e("form", { onSubmit: submit },
        e(Field, { label: "Nome" }, e("input", { value: form.name, onChange: function (ev) { setForm(Object.assign({}, form, { name: ev.target.value })); if (error) setError(""); } })),
        e(Field, { label: "Telefone" }, e("input", { value: form.phone, onChange: function (ev) { setForm(Object.assign({}, form, { phone: ev.target.value })); }, placeholder: "(00) 00000-0000" })),
        e(Field, { label: "Medidas" }, e("textarea", { rows: 2, value: form.measurements, onChange: function (ev) { setForm(Object.assign({}, form, { measurements: ev.target.value })); }, placeholder: "Busto 90, cintura 70, quadril 98..." })),
        e(Field, { label: "Observações" }, e("textarea", { rows: 2, value: form.notes, onChange: function (ev) { setForm(Object.assign({}, form, { notes: ev.target.value })); }, placeholder: "Preferências, alergias a tecido, etc." })),
        error ? e("div", { className: "form-error" }, error) : null,
        e("button", { type: "submit", className: "btn btn-primary", style: { width: "100%", justifyContent: "center" } }, editing === "new" ? "Salvar" : "Salvar alterações")
      )
    ) : null,
    confirm ? e(ConfirmModal, { message: confirm.message, confirmLabel: confirm.confirmLabel, danger: confirm.danger, onConfirm: confirm.onConfirm, onCancel: function () { setConfirm(null); } }) : null
  );
}

// ---------- PRODUTOS & SERVIÇOS ----------
function ProdutosTab(props) {
  var products = props.products, persistProducts = props.persistProducts;
  var useState = React.useState;
  var editingS = useState(null); var editing = editingS[0], setEditing = editingS[1];
  var formS = useState({ name: "", type: "produto", price: "", unidade: "unidade", controlaEstoque: false, estoqueQtd: "", estoqueMin: "" });
  var form = formS[0], setForm = formS[1];
  var errorS = useState(""); var error = errorS[0], setError = errorS[1];
  var confirmS = useState(null); var confirm = confirmS[0], setConfirm = confirmS[1];
  var searchS = useState(""); var search = searchS[0], setSearch = searchS[1];

  var filtered = search.trim()
    ? products.filter(function (p) { return p.name.toLowerCase().indexOf(search.trim().toLowerCase()) !== -1; })
    : products;

  function openNew() { setForm({ name: "", type: "produto", price: "", unidade: "unidade", controlaEstoque: false, estoqueQtd: "", estoqueMin: "" }); setError(""); setEditing("new"); }
  function openEdit(p) {
    setForm({
      name: p.name, type: p.type, price: String(p.price), unidade: p.unidade || "unidade",
      controlaEstoque: !!p.controlaEstoque,
      estoqueQtd: p.estoqueQtd !== undefined ? String(p.estoqueQtd) : "",
      estoqueMin: p.estoqueMin !== undefined ? String(p.estoqueMin) : ""
    });
    setError("");
    setEditing(p.id);
  }

  function submit(ev) {
    ev.preventDefault();
    if (!form.name.trim()) { setError("Digite o nome do item."); return; }
    if (!form.price || parseFloat(form.price) <= 0) { setError("Informe um preço válido."); return; }
    if (editing !== "new") {
      setConfirm({
        message: "Confirma as alterações em \"" + form.name + "\"?",
        confirmLabel: "Salvar alterações",
        onConfirm: function () { doSave(); setConfirm(null); }
      });
    } else {
      doSave();
    }
  }

  function doSave() {
    var data = {
      name: form.name.trim(), type: form.type, price: parseFloat(form.price),
      unidade: form.type === "produto" ? form.unidade : null,
      controlaEstoque: form.type === "produto" ? !!form.controlaEstoque : false,
      estoqueQtd: form.type === "produto" && form.controlaEstoque ? (parseFloat(form.estoqueQtd) || 0) : 0,
      estoqueMin: form.type === "produto" && form.controlaEstoque ? (parseFloat(form.estoqueMin) || 0) : 0
    };
    if (editing === "new") persistProducts([Object.assign({}, data, { id: uid() })].concat(products));
    else persistProducts(products.map(function (p) { return p.id === editing ? Object.assign({}, data, { id: editing }) : p; }));
    setEditing(null);
  }

  function requestRemove(p) {
    setConfirm({
      message: "Excluir \"" + p.name + "\"? Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      danger: true,
      onConfirm: function () { remove(p.id); setConfirm(null); }
    });
  }
  function remove(id) { persistProducts(products.filter(function (p) { return p.id !== id; })); }

  return e("div", { className: "card" },
    e("div", { className: "list-head" },
      e("div", { className: "card-title", style: { marginBottom: 0 } }, Icon("👕", 16), " Produtos e serviços"),
      e("button", { className: "btn btn-primary", onClick: openNew }, Icon("+", 15), " Item")
    ),
    e("div", { className: "search-box" },
      Icon("🔍", 15, "var(--ink-soft)"),
      e("input", { placeholder: "Buscar produto ou serviço...", value: search, onChange: function (ev) { setSearch(ev.target.value); } })
    ),
    e(Stitch, { style: { margin: "14px 0" } }),
    filtered.length === 0 ?
      e(Empty, { icon: "👕", text: search.trim() ? "Nenhum item encontrado para \"" + search + "\"." : "Cadastre peças prontas e serviços (bainha, ajuste, reforma...) com seus preços." }) :
      e("table", null,
        e("thead", null, e("tr", null, e("th", null, "Nome"), e("th", null, "Tipo"), e("th", null, "Preço"), e("th", null, "Estoque"), e("th", null, ""))),
        e("tbody", null,
          filtered.map(function (p) {
            var unit = UNIT_LABELS[p.unidade] || "un.";
            var low = p.controlaEstoque && p.estoqueQtd <= p.estoqueMin;
            return e("tr", { key: p.id },
              e("td", null, p.name),
              e("td", null, e("span", { className: "badge " + (p.type === "produto" ? "badge-entrada" : "badge-ok") }, p.type === "produto" ? "Produto" : "Serviço")),
              e("td", { className: "font-mono" }, fmtBRL(p.price) + (p.type === "produto" ? " / " + unit : "")),
              e("td", null,
                p.type === "servico" ? e("span", { style: { color: "var(--ink-soft)" } }, "—") :
                !p.controlaEstoque ? e("span", { style: { color: "var(--ink-soft)" } }, "Não controlado") :
                e("span", { className: "badge " + (low ? "badge-low" : "badge-ok") }, (low ? "⚠️ " : "") + p.estoqueQtd + " " + unit)
              ),
              e("td", null,
                e("div", { style: { display: "flex", gap: 4 } },
                  e("button", { className: "icon-btn", onClick: function () { openEdit(p); } }, Icon("✎", 15)),
                  e("button", { className: "icon-btn", onClick: function () { requestRemove(p); } }, Icon("🗑", 15))
                )
              )
            );
          })
        )
      ),
    editing ? e(Modal, { title: editing === "new" ? "Novo item" : "Editar item", onClose: function () { setEditing(null); } },
      e("form", { onSubmit: submit },
        e(Field, { label: "Nome" }, e("input", { value: form.name, onChange: function (ev) { setForm(Object.assign({}, form, { name: ev.target.value })); if (error) setError(""); }, placeholder: "Ex: Bainha simples" })),
        e("div", { className: "row" },
          e(Field, { label: "Tipo" },
            e("select", { value: form.type, onChange: function (ev) { setForm(Object.assign({}, form, { type: ev.target.value })); } },
              e("option", { value: "produto" }, "Produto"),
              e("option", { value: "servico" }, "Serviço")
            )
          ),
          e(Field, { label: "Preço (R$)" }, e("input", { type: "number", step: "0.01", min: "0", value: form.price, onChange: function (ev) { setForm(Object.assign({}, form, { price: ev.target.value })); if (error) setError(""); } }))
        ),
        form.type === "produto" ? e(Field, { label: "Vendido por" },
          e("select", { value: form.unidade, onChange: function (ev) { setForm(Object.assign({}, form, { unidade: ev.target.value })); } },
            QTY_UNITS.map(function (u) { return e("option", { key: u, value: u }, u.charAt(0).toUpperCase() + u.slice(1)); })
          )
        ) : null,
        form.type === "produto" ? e("div", { style: { marginTop: 4 } },
          e("label", { className: "checkbox-row" },
            e("input", { type: "checkbox", checked: form.controlaEstoque, onChange: function (ev) { setForm(Object.assign({}, form, { controlaEstoque: ev.target.checked })); } }),
            e("span", null, "Controlar estoque deste produto")
          ),
          form.controlaEstoque ? e("div", { className: "row", style: { marginTop: 10 } },
            e(Field, { label: "Quantidade em estoque (" + UNIT_LABELS[form.unidade] + ")" }, e("input", {
              type: "number", step: form.unidade === "unidade" ? "1" : "0.01", min: "0", value: form.estoqueQtd,
              onChange: function (ev) {
                var v = ev.target.value;
                if (form.unidade === "unidade") v = v.replace(/[^\d]/g, "");
                setForm(Object.assign({}, form, { estoqueQtd: v }));
              }
            })),
            e(Field, { label: "Alerta mínimo" }, e("input", { type: "number", step: "0.01", min: "0", value: form.estoqueMin, onChange: function (ev) { setForm(Object.assign({}, form, { estoqueMin: ev.target.value })); } }))
          ) : null
        ) : null,
        error ? e("div", { className: "form-error" }, error) : null,
        e("button", { type: "submit", className: "btn btn-primary", style: { width: "100%", justifyContent: "center", marginTop: 14 } }, editing === "new" ? "Salvar" : "Salvar alterações")
      )
    ) : null,
    confirm ? e(ConfirmModal, { message: confirm.message, confirmLabel: confirm.confirmLabel, danger: confirm.danger, onConfirm: confirm.onConfirm, onCancel: function () { setConfirm(null); } }) : null
  );
}

// ---------- ESTOQUE ----------
function EstoqueTab(props) {
  var inventory = props.inventory, persistStock = props.persistStock;
  var useState = React.useState;
  var editingS = useState(null); var editing = editingS[0], setEditing = editingS[1];
  var formS = useState({ name: "", qty: "", unit: "un", minAlert: "", cost: "" });
  var form = formS[0], setForm = formS[1];
  var errorS = useState(""); var error = errorS[0], setError = errorS[1];
  var confirmS = useState(null); var confirm = confirmS[0], setConfirm = confirmS[1];

  function openNew() { setForm({ name: "", qty: "", unit: "un", minAlert: "", cost: "" }); setError(""); setEditing("new"); }
  function openEdit(i) { setForm(i); setError(""); setEditing(i.id); }

  function submit(ev) {
    ev.preventDefault();
    if (!form.name.trim()) { setError("Digite o nome do material."); return; }
    if (editing !== "new") {
      setConfirm({
        message: "Confirma as alterações em \"" + form.name + "\"?",
        confirmLabel: "Salvar alterações",
        onConfirm: function () { doSave(); setConfirm(null); }
      });
    } else {
      doSave();
    }
  }

  function doSave() {
    var data = Object.assign({}, form, {
      qty: parseFloat(form.qty) || 0,
      minAlert: parseFloat(form.minAlert) || 0,
      cost: parseFloat(form.cost) || 0
    });
    if (editing === "new") persistStock([Object.assign({}, data, { id: uid() })].concat(inventory));
    else persistStock(inventory.map(function (i) { return i.id === editing ? Object.assign({}, data, { id: editing }) : i; }));
    setEditing(null);
  }

  function requestRemove(i) {
    setConfirm({
      message: "Excluir \"" + i.name + "\" do estoque? Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      danger: true,
      onConfirm: function () { remove(i.id); setConfirm(null); }
    });
  }
  function remove(id) { persistStock(inventory.filter(function (i) { return i.id !== id; })); }
  function adjust(id, delta) {
    persistStock(inventory.map(function (i) {
      return i.id === id ? Object.assign({}, i, { qty: Math.max(0, +(i.qty + delta).toFixed(2)) }) : i;
    }));
  }

  return e("div", { className: "card" },
    e("div", { className: "list-head" },
      e("div", { className: "card-title", style: { marginBottom: 0 } }, Icon("📦", 16), " Estoque de materiais"),
      e("button", { className: "btn btn-primary", onClick: openNew }, Icon("+", 15), " Material")
    ),
    e(Stitch, { style: { margin: "14px 0" } }),
    inventory.length === 0 ?
      e(Empty, { icon: "📦", text: "Cadastre tecidos, linhas, botões e outros aviamentos." }) :
      e("table", null,
        e("thead", null, e("tr", null, e("th", null, "Material"), e("th", null, "Qtd."), e("th", null, "Custo unit."), e("th", null, "Situação"), e("th", null, ""))),
        e("tbody", null,
          inventory.map(function (i) {
            var low = i.qty <= i.minAlert;
            return e("tr", { key: i.id },
              e("td", null, i.name),
              e("td", null,
                e("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
                  e("button", { className: "btn btn-outline btn-sm", onClick: function () { adjust(i.id, -1); } }, "−"),
                  e("span", { className: "font-mono" }, i.qty + " " + i.unit),
                  e("button", { className: "btn btn-outline btn-sm", onClick: function () { adjust(i.id, 1); } }, "+")
                )
              ),
              e("td", { className: "font-mono" }, fmtBRL(i.cost)),
              e("td", null, low ? e("span", { className: "badge badge-low" }, Icon("⚠️", 11), " Estoque baixo") : e("span", { className: "badge badge-ok" }, "OK")),
              e("td", null,
                e("div", { style: { display: "flex", gap: 4 } },
                  e("button", { className: "icon-btn", onClick: function () { openEdit(i); } }, Icon("✎", 15)),
                  e("button", { className: "icon-btn", onClick: function () { requestRemove(i); } }, Icon("🗑", 15))
                )
              )
            );
          })
        )
      ),
    editing ? e(Modal, { title: editing === "new" ? "Novo material" : "Editar material", onClose: function () { setEditing(null); } },
      e("form", { onSubmit: submit },
        e(Field, { label: "Nome" }, e("input", { value: form.name, onChange: function (ev) { setForm(Object.assign({}, form, { name: ev.target.value })); if (error) setError(""); }, placeholder: "Ex: Tecido tricoline azul" })),
        e("div", { className: "row" },
          e(Field, { label: "Quantidade" }, e("input", {
            type: "number", step: form.unit === "un" ? "1" : "0.01", value: form.qty,
            onChange: function (ev) {
              var v = ev.target.value;
              if (form.unit === "un") v = v.replace(/[^\d]/g, "");
              setForm(Object.assign({}, form, { qty: v }));
            }
          })),
          e(Field, { label: "Unidade" },
            e("select", { value: form.unit, onChange: function (ev) { setForm(Object.assign({}, form, { unit: ev.target.value })); } },
              e("option", { value: "un" }, "unidade"), e("option", { value: "m" }, "metro"), e("option", { value: "kg" }, "kg"), e("option", { value: "rolo" }, "rolo")
            )
          )
        ),
        e("div", { className: "row" },
          e(Field, { label: "Alerta mínimo" }, e("input", { type: "number", step: "0.01", value: form.minAlert, onChange: function (ev) { setForm(Object.assign({}, form, { minAlert: ev.target.value })); } })),
          e(Field, { label: "Custo unitário (R$)" }, e("input", { type: "number", step: "0.01", value: form.cost, onChange: function (ev) { setForm(Object.assign({}, form, { cost: ev.target.value })); } }))
        ),
        error ? e("div", { className: "form-error" }, error) : null,
        e("button", { type: "submit", className: "btn btn-primary", style: { width: "100%", justifyContent: "center" } }, editing === "new" ? "Salvar" : "Salvar alterações")
      )
    ) : null,
    confirm ? e(ConfirmModal, { message: confirm.message, confirmLabel: confirm.confirmLabel, danger: confirm.danger, onConfirm: confirm.onConfirm, onCancel: function () { setConfirm(null); } }) : null
  );
}

// ---------- ORÇAMENTOS ----------
function newRow() {
  return { rowId: uid(), itemId: "", description: "", qty: "1", unit: "unidade", price: "0" };
}

function OrcamentosTab(props) {
  var orcamentos = props.orcamentos, persistOrcamentos = props.persistOrcamentos, clients = props.clients, products = props.products;
  var persistProducts = props.persistProducts, transactions = props.transactions, persistTx = props.persistTx;
  var useState = React.useState;

  var editingIdS = useState(null); var editingId = editingIdS[0], setEditingId = editingIdS[1];
  var clientNameS = useState(""); var clientName = clientNameS[0], setClientName = clientNameS[1];
  var notesS = useState(""); var notes = notesS[0], setNotes = notesS[1];
  var rowsS = useState([newRow()]); var rows = rowsS[0], setRows = rowsS[1];
  var searchS = useState(""); var productSearch = searchS[0], setProductSearch = searchS[1];
  var errorS = useState(""); var error = errorS[0], setError = errorS[1];
  var confirmS = useState(null); var confirm = confirmS[0], setConfirm = confirmS[1];
  var previewS = useState(null); var preview = previewS[0], setPreview = previewS[1];
  var copiedS = useState(false); var copied = copiedS[0], setCopied = copiedS[1];
  var launchS = useState(null); var launch = launchS[0], setLaunch = launchS[1];

  var filteredProducts = productSearch.trim()
    ? products.filter(function (p) { return p.name.toLowerCase().indexOf(productSearch.trim().toLowerCase()) !== -1; })
    : products;

  function calcRows(list) {
    return list.map(function (r) {
      var qty = parseFloat(r.qty) || 0;
      var price = parseFloat(r.price) || 0;
      return Object.assign({}, r, { subtotal: qty * price });
    });
  }
  var computedRows = calcRows(rows);
  var total = computedRows.reduce(function (s, r) { return s + r.subtotal; }, 0);

  function addRow() { setRows(rows.concat([newRow()])); }
  function removeRow(rowId) {
    if (rows.length === 1) { setRows([newRow()]); return; }
    setRows(rows.filter(function (r) { return r.rowId !== rowId; }));
  }
  function updateRow(rowId, changes) {
    setRows(rows.map(function (r) { return r.rowId === rowId ? Object.assign({}, r, changes) : r; }));
    if (error) setError("");
  }
  function pickProduct(rowId, itemId) {
    var item = products.find(function (p) { return p.id === itemId; });
    if (!item) { updateRow(rowId, { itemId: "" }); return; }
    updateRow(rowId, { itemId: itemId, description: item.name, price: String(item.price), unit: item.unidade || "unidade" });
  }

  // usado ao clicar num resultado da lista de busca: preenche uma linha vazia
  // existente, ou cria uma nova linha já com o produto escolhido.
  function selectFromSearch(item) {
    var emptyRow = rows.find(function (r) { return !r.description.trim() && !r.itemId; });
    if (emptyRow) {
      pickProduct(emptyRow.rowId, item.id);
    } else {
      setRows(rows.concat([Object.assign(newRow(), { itemId: item.id, description: item.name, price: String(item.price), unit: item.unidade || "unidade" })]));
    }
    setProductSearch("");
  }

  function resetDraft() {
    setEditingId(null);
    setClientName("");
    setNotes("");
    setRows([newRow()]);
    setProductSearch("");
    setError("");
  }

  function openEdit(orc) {
    setEditingId(orc.id);
    setClientName(orc.clientName || "");
    setNotes(orc.notes || "");
    setRows(orc.items.map(function (it) {
      return { rowId: uid(), itemId: it.itemId || "", description: it.description, qty: String(it.qty), unit: it.unit || "unidade", price: String(it.price) };
    }));
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildOrcamento(baseId, baseDate, baseCreatedAt) {
    var itemsValidos = computedRows.filter(function (r) { return r.description.trim() && r.subtotal >= 0; });
    return {
      id: baseId || uid(),
      date: baseDate || todayStr(),
      createdAt: baseCreatedAt || Date.now(),
      clientName: clientName.trim() || null,
      notes: notes.trim() || "",
      status: null,
      items: itemsValidos.map(function (r) {
        return { itemId: r.itemId || null, description: r.description.trim(), qty: parseFloat(r.qty) || 1, unit: r.unit, price: parseFloat(r.price) || 0, subtotal: r.subtotal };
      }),
      total: itemsValidos.reduce(function (s, r) { return s + r.subtotal; }, 0)
    };
  }

  function validar() {
    var algumPreenchido = rows.some(function (r) { return r.description.trim(); });
    if (!algumPreenchido) { setError("Adicione ao menos um produto ou serviço."); return false; }
    return true;
  }

  function salvar() {
    if (!validar()) return;
    if (editingId) {
      setConfirm({
        message: "Confirma as alterações neste orçamento?",
        confirmLabel: "Salvar alterações",
        onConfirm: function () { doSalvar(); setConfirm(null); }
      });
    } else {
      doSalvar();
    }
  }

  function doSalvar() {
    if (editingId) {
      var old = orcamentos.find(function (o) { return o.id === editingId; });
      var atualizado = buildOrcamento(editingId, old ? old.date : todayStr(), old ? old.createdAt : Date.now());
      atualizado.status = old ? old.status : null;
      atualizado.confirmedAt = old ? old.confirmedAt : null;
      atualizado.confirmedTxId = old ? old.confirmedTxId : null;
      persistOrcamentos(orcamentos.map(function (o) { return o.id === editingId ? atualizado : o; }));
    } else {
      persistOrcamentos([buildOrcamento()].concat(orcamentos));
    }
    resetDraft();
  }

  function gerarTexto(orc) {
    var linhas = [];
    linhas.push(orc.clientName ? "Olá, " + orc.clientName + "! Preparei seu orçamento! 🧵" : "Preparei seu orçamento! 🧵");
    linhas.push("");
    linhas.push("");
    orc.items.forEach(function (it) {
      var unidLabel = UNIT_LABELS[it.unit] || it.unit || "un.";
      linhas.push("• " + it.description + " (Qtd: " + it.qty + " " + unidLabel + ") — " + fmtBRL(it.subtotal));
    });
    linhas.push("");
    linhas.push("*Total: " + fmtBRL(orc.total) + "*");
    if (orc.notes) {
      linhas.push("");
      linhas.push("Observações: " + orc.notes);
    }
    linhas.push("");
    linhas.push("Qualquer dúvida, é só chamar! 😊");
    return linhas.join("\n");
  }

  function abrirPreviewDraft() {
    if (!validar()) return;
    setPreview(gerarTexto(buildOrcamento()));
    setCopied(false);
  }
  function abrirPreviewSalvo(orc) {
    setPreview(gerarTexto(orc));
    setCopied(false);
  }

  function copiarPreview() {
    copyText(preview, function (ok) { setCopied(ok); });
  }

  function requestRemove(orc) {
    setConfirm({
      message: "Excluir o orçamento de \"" + (orc.clientName || "cliente não identificado") + "\" (" + fmtDate(orc.date) + ")? Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      danger: true,
      onConfirm: function () {
        persistOrcamentos(orcamentos.filter(function (o) { return o.id !== orc.id; }));
        if (editingId === orc.id) resetDraft();
        setConfirm(null);
      }
    });
  }

  function abrirLancamento(orc) {
    setLaunch({ orc: orc, payment: PAYMENTS[0], date: todayStr() });
  }

  function confirmarLancamento() {
    var orc = launch.orc;
    var client = clients.find(function (c) { return c.name === orc.clientName; });
    var tx = {
      id: uid(), createdAt: Date.now(), type: "entrada",
      category: ENTRADA_CATS[0], description: orc.items.map(function (it) { return it.description; }).join(" + "),
      value: orc.total, payment: launch.payment, clientId: client ? client.id : null,
      clientName: orc.clientName || null, items: orc.items, date: launch.date
    };
    persistProducts(applyStockEffectsForItems(products, orc.items, -1));
    persistTx([tx].concat(transactions));
    persistOrcamentos(orcamentos.map(function (o) {
      return o.id === orc.id ? Object.assign({}, o, { status: "confirmado", confirmedAt: Date.now(), confirmedTxId: tx.id }) : o;
    }));
    setLaunch(null);
  }

  return e("div", null,
    e("div", { className: "card" },
      e("div", { className: "list-head" },
        e("div", { className: "card-title", style: { marginBottom: 0 } }, Icon("🧾", 16), " " + (editingId ? "Editando orçamento" : "Novo orçamento")),
        editingId ? e("button", { type: "button", className: "btn btn-outline btn-sm", onClick: resetDraft }, "Cancelar edição") : null
      ),
      e(Field, { label: "Cliente (opcional)" },
        e("input", { list: "clientes-lista", value: clientName, onChange: function (ev) { setClientName(ev.target.value); }, placeholder: "Nome do cliente" })
      ),
      e("datalist", { id: "clientes-lista" }, clients.map(function (c) { return e("option", { key: c.id, value: c.name }); })),

      e("div", { style: { marginTop: 14 } },
        e(Field, { label: "Buscar produto cadastrado" },
          e("div", { className: "search-box", style: { marginBottom: 0 } },
            Icon("🔍", 14, "var(--ink-soft)"),
            e("input", { value: productSearch, onChange: function (ev) { setProductSearch(ev.target.value); }, placeholder: "Digite o nome do produto ou serviço..." })
          )
        ),
        productSearch.trim() ? e("div", { className: "search-results" },
          filteredProducts.length === 0 ?
            e("div", { className: "search-results-empty" }, "Nenhum produto encontrado para \"" + productSearch + "\".") :
            filteredProducts.map(function (p) {
              var tag = p.type === "produto" ? " (" + (UNIT_LABELS[p.unidade] || "un") + ")" : " (serviço)";
              return e("button", { type: "button", key: p.id, className: "search-result-item", onClick: function () { selectFromSearch(p); } },
                e("span", null, p.name + tag),
                e("span", { className: "font-mono" }, fmtBRL(p.price))
              );
            })
        ) : null
      ),

      e("div", { style: { marginTop: 10 } },
        computedRows.map(function (r, idx) {
          return e("div", { key: r.rowId, className: "orc-row" },
            e("div", { className: "orc-row-main" },
              e(Field, { label: idx === 0 ? "Item cadastrado" : "" },
                e("select", { value: r.itemId, onChange: function (ev) { pickProduct(r.rowId, ev.target.value); } },
                  [e("option", { key: "none", value: "" }, "Item avulso (digite abaixo)")].concat(
                    filteredProducts.map(function (p) { return e("option", { key: p.id, value: p.id }, p.name + " — " + fmtBRL(p.price)); })
                  )
                )
              ),
              e(Field, { label: idx === 0 ? "Descrição" : "" },
                e("input", {
                  value: r.description,
                  onChange: function (ev) { updateRow(r.rowId, { description: ev.target.value }); },
                  placeholder: "Ex: Vestido sob medida",
                  readOnly: !!r.itemId,
                  style: r.itemId ? { background: "var(--linen)", color: "var(--ink-soft)" } : null
                })
              )
            ),
            e("div", { className: "orc-row-nums" },
              e(Field, { label: idx === 0 ? "Qtd." : "" },
                e("input", {
                  type: "number", step: r.unit === "unidade" ? "1" : "0.01", min: r.unit === "unidade" ? "1" : "0",
                  value: r.qty,
                  onChange: function (ev) {
                    var v = ev.target.value;
                    if (r.unit === "unidade") v = v.replace(/[^\d]/g, "");
                    updateRow(r.rowId, { qty: v });
                  }
                })
              ),
              e(Field, { label: idx === 0 ? "Un." : "" },
                e("select", { value: r.unit, onChange: function (ev) { updateRow(r.rowId, { unit: ev.target.value }); }, disabled: !!r.itemId },
                  QTY_UNITS.map(function (u) { return e("option", { key: u, value: u }, UNIT_LABELS[u]); })
                )
              ),
              e(Field, { label: idx === 0 ? "Preço unit." : "" },
                e("input", { type: "number", step: "0.01", min: "0", value: r.price, onChange: function (ev) { updateRow(r.rowId, { price: ev.target.value }); }, readOnly: !!r.itemId, style: r.itemId ? { background: "var(--linen)", color: "var(--ink-soft)" } : null })
              ),
              e("div", { className: "orc-row-sub" },
                idx === 0 ? e("span", { className: "field-label" }, "Subtotal") : null,
                e("div", { className: "font-mono", style: { fontWeight: 600, paddingTop: idx === 0 ? 0 : 9 } }, fmtBRL(r.subtotal))
              ),
              e("button", { type: "button", className: "icon-btn", style: { marginTop: idx === 0 ? 22 : 0 }, onClick: function () { removeRow(r.rowId); } }, Icon("🗑", 15))
            )
          );
        })
      ),

      e("button", { type: "button", className: "btn btn-outline btn-sm", style: { marginTop: 6, marginBottom: 14 }, onClick: addRow }, Icon("+", 13), " Adicionar produto"),

      e(Field, { label: "Observações (opcional)" },
        e("textarea", { rows: 2, value: notes, onChange: function (ev) { setNotes(ev.target.value); }, placeholder: "Prazo de entrega, condições de pagamento, etc." })
      ),

      e(Stitch, { style: { margin: "18px 0" } }),

      e("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        e("div", { className: "font-display", style: { fontSize: 17 } }, "Total"),
        e("div", { className: "font-mono", style: { fontSize: 22, fontWeight: 600 } }, fmtBRL(total))
      ),

      error ? e("div", { className: "form-error", style: { marginTop: 12 } }, error) : null,

      e("div", { style: { display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" } },
        e("button", { type: "button", className: "btn btn-primary", onClick: salvar }, Icon("💾", 14), editingId ? " Salvar alterações" : " Salvar orçamento"),
        e("button", { type: "button", className: "btn btn-outline", onClick: abrirPreviewDraft }, Icon("📋", 14), " Copiar como texto")
      )
    ),

    e("div", { className: "card" },
      e("div", { className: "card-title" }, "Orçamentos salvos"),
      orcamentos.length === 0 ?
        e(Empty, { icon: "🧾", text: "Nenhum orçamento salvo ainda." }) :
        orcamentos.map(function (orc) {
          return e("div", { key: orc.id, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 2px", borderBottom: "1px solid var(--line)", gap: 10, flexWrap: "wrap" } },
            e("div", null,
              e("div", { style: { fontWeight: 600 } },
                orc.clientName || "Cliente não identificado",
                orc.status === "confirmado" ? e("span", { className: "badge badge-ok", style: { marginLeft: 8 } }, "✅ Lançado no caixa") : null
              ),
              e("div", { style: { fontSize: 12.5, color: "var(--ink-soft)" } }, fmtDate(orc.date) + " · " + orc.items.length + " item(ns) · " + fmtBRL(orc.total))
            ),
            e("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
              orc.status !== "confirmado" ? e("button", { className: "btn btn-outline btn-sm", onClick: function () { abrirLancamento(orc); } }, Icon("💲", 12), " Confirmar no caixa") : null,
              e("button", { className: "icon-btn", onClick: function () { openEdit(orc); } }, Icon("✎", 15)),
              e("button", { className: "icon-btn", onClick: function () { abrirPreviewSalvo(orc); } }, Icon("📋", 15)),
              e("button", { className: "icon-btn", onClick: function () { requestRemove(orc); } }, Icon("🗑", 15))
            )
          );
        })
    ),

    preview ? e(Modal, { title: "Prévia do orçamento", onClose: function () { setPreview(null); } },
      e("textarea", { readOnly: true, value: preview, rows: 10, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, marginBottom: 12 }, onFocus: function (ev) { ev.target.select(); } }),
      e("button", { type: "button", className: "btn btn-primary", style: { width: "100%", justifyContent: "center" }, onClick: copiarPreview }, Icon("📋", 14), " Copiar texto"),
      copied ? e("div", { className: "form-hint", style: { marginTop: 12, marginBottom: 0 } }, "Orçamento copiado!") : e("div", { style: { fontSize: 12, color: "var(--ink-soft)", marginTop: 10 } }, "Se o botão não copiar automaticamente, toque no texto acima, selecione tudo e copie manualmente.")
    ) : null,

    launch ? e(Modal, { title: "Confirmar orçamento no caixa", onClose: function () { setLaunch(null); } },
      e("p", { style: { fontSize: 13.5, color: "var(--ink-soft)", marginTop: -4, marginBottom: 14 } },
        "Isso vai criar um lançamento de entrada no Caixa com todos os itens deste orçamento e dar baixa no estoque, se houver."
      ),
      e("div", { style: { marginBottom: 14 } },
        launch.orc.items.map(function (it, idx) {
          return e("div", { key: idx, style: { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" } },
            e("span", null, it.description + " (Qtd: " + it.qty + " " + (UNIT_LABELS[it.unit] || it.unit) + ")"),
            e("span", { className: "font-mono" }, fmtBRL(it.subtotal))
          );
        })
      ),
      e("div", { className: "row" },
        e(Field, { label: "Forma de pagamento" },
          e("select", { value: launch.payment, onChange: function (ev) { setLaunch(Object.assign({}, launch, { payment: ev.target.value })); } },
            PAYMENTS.map(function (p) { return e("option", { key: p }, p); })
          )
        ),
        e(Field, { label: "Data" },
          e("input", { type: "date", value: launch.date, onChange: function (ev) { setLaunch(Object.assign({}, launch, { date: ev.target.value })); } })
        )
      ),
      e("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0 16px" } },
        e("div", { className: "font-display", style: { fontSize: 16 } }, "Total"),
        e("div", { className: "font-mono", style: { fontSize: 20, fontWeight: 600 } }, fmtBRL(launch.orc.total))
      ),
      e("button", { type: "button", className: "btn btn-primary", style: { width: "100%", justifyContent: "center" }, onClick: confirmarLancamento }, "Lançar no caixa")
    ) : null,

    confirm ? e(ConfirmModal, { message: confirm.message, confirmLabel: confirm.confirmLabel, danger: confirm.danger, onConfirm: confirm.onConfirm, onCancel: function () { setConfirm(null); } }) : null
  );
}

// ---------- RELATÓRIOS ----------
function RelatoriosTab(props) {
  var transactions = props.transactions, clients = props.clients, products = props.products, inventory = props.inventory;
  var persistTx = props.persistTx, persistClients = props.persistClients, persistProducts = props.persistProducts, persistStock = props.persistStock;
  var useState = React.useState, useMemo = React.useMemo;
  var periodS = useState("7d"); var period = periodS[0], setPeriod = periodS[1];
  var customFromS = useState(todayStr()); var customFrom = customFromS[0], setCustomFrom = customFromS[1];
  var customToS = useState(todayStr()); var customTo = customToS[0], setCustomTo = customToS[1];
  var restoreMsgS = useState(""); var restoreMsg = restoreMsgS[0], setRestoreMsg = restoreMsgS[1];

  var range = useMemo(function () {
    var end = new Date();
    var start = new Date();
    if (period === "hoje") start = new Date();
    else if (period === "7d") start.setDate(end.getDate() - 6);
    else if (period === "30d") start.setDate(end.getDate() - 29);
    else if (period === "mes") start = new Date(end.getFullYear(), end.getMonth(), 1);
    else if (period === "ano") start = new Date(end.getFullYear(), 0, 1);
    else if (period === "personalizado") {
      return { start: customFrom, end: customTo };
    }
    return { start: dateToStr(start), end: dateToStr(end) };
  }, [period, customFrom, customTo]);

  var filtered = transactions.filter(function (t) { return t.date >= range.start && t.date <= range.end; })
    .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  var entradas = filtered.filter(function (t) { return t.type === "entrada"; }).reduce(function (s, t) { return s + t.value; }, 0);
  var saidas = filtered.filter(function (t) { return t.type === "saida"; }).reduce(function (s, t) { return s + t.value; }, 0);

  var byCategory = useMemo(function () {
    var map = {};
    filtered.filter(function (t) { return t.type === "entrada"; }).forEach(function (t) { map[t.category] = (map[t.category] || 0) + t.value; });
    return Object.entries(map).sort(function (a, b) { return b[1] - a[1]; });
  }, [filtered]);
  var maxCat = byCategory.length ? byCategory[0][1] : 1;

  var topClients = useMemo(function () {
    var map = {};
    filtered.filter(function (t) { return t.clientId; }).forEach(function (t) { map[t.clientName] = (map[t.clientName] || 0) + t.value; });
    return Object.entries(map).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
  }, [filtered]);

  function exportarCSV() {
    var csv = toCSV(filtered, [
      { label: "Data", get: function (t) { return fmtDate(t.date); } },
      { label: "Tipo", get: function (t) { return t.type === "entrada" ? "Entrada" : "Saída"; } },
      { label: "Categoria", get: function (t) { return t.category; } },
      { label: "Descrição", get: function (t) { return t.description; } },
      { label: "Itens", get: function (t) { return t.items ? t.items.length : (t.itemId ? 1 : 0); } },
      { label: "Quantidade", get: function (t) { return t.items && t.items.length === 1 ? t.items[0].qty : (t.qty || ""); } },
      { label: "Unidade", get: function (t) { var u = t.items && t.items.length === 1 ? t.items[0].unit : t.qtyUnit; return u ? (UNIT_LABELS[u] || u) : ""; } },
      { label: "Forma de pagamento", get: function (t) { return t.payment; } },
      { label: "Cliente", get: function (t) { return t.clientName || ""; } },
      { label: "Valor", get: function (t) { return t.value.toFixed(2).replace(".", ","); } },
      { label: "Observações", get: function (t) { return t.notes || ""; } }
    ]);
    downloadFile("lancamentos_" + range.start + "_a_" + range.end + ".csv", csv, "text/csv;charset=utf-8");
  }

  function exportarBackup() {
    var backup = {
      geradoEm: new Date().toISOString(),
      transactions: transactions, clients: clients, products: products, inventory: inventory
    };
    downloadFile("backup_fio_e_caixa_" + todayStr() + ".json", JSON.stringify(backup, null, 2), "application/json");
  }

  function importarBackup(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e2) {
      try {
        var data = JSON.parse(e2.target.result);
        if (!data || typeof data !== "object") throw new Error("Arquivo inválido");
        if (Array.isArray(data.transactions)) persistTx(data.transactions);
        if (Array.isArray(data.clients)) persistClients(data.clients);
        if (Array.isArray(data.products)) persistProducts(data.products);
        if (Array.isArray(data.inventory)) persistStock(data.inventory);
        setRestoreMsg("Backup restaurado com sucesso!");
      } catch (err) {
        setRestoreMsg("Não foi possível ler esse arquivo. Verifique se é um backup válido.");
      }
    };
    reader.readAsText(file);
    ev.target.value = "";
  }

  return e("div", null,
    e("div", { className: "period-select", style: { marginBottom: 18, flexWrap: "wrap", gap: 6 } },
      [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["mes", "Este mês"], ["ano", "Este ano"], ["personalizado", "Data específica"]].map(function (pair) {
        var id = pair[0], label = pair[1];
        return e("button", { key: id, className: period === id ? "active" : "", onClick: function () { setPeriod(id); } }, label);
      })
    ),

    period === "personalizado" ? e("div", { className: "card", style: { paddingTop: 14, paddingBottom: 14 } },
      e("div", { className: "row" },
        e(Field, { label: "De" }, e("input", { type: "date", value: customFrom, onChange: function (ev) { setCustomFrom(ev.target.value); } })),
        e(Field, { label: "Até" }, e("input", { type: "date", value: customTo, onChange: function (ev) { setCustomTo(ev.target.value); } }))
      )
    ) : null,

    e("div", { className: "stat-grid" },
      e("div", { className: "stat-card" },
        e("div", { className: "stat-label" }, Icon("↑", 14, "var(--teal-dark)"), " Entradas"),
        e("div", { className: "stat-value", style: { color: "var(--teal-dark)" } }, fmtBRL(entradas))
      ),
      e("div", { className: "stat-card" },
        e("div", { className: "stat-label" }, Icon("↓", 14, "var(--brick)"), " Saídas"),
        e("div", { className: "stat-value", style: { color: "var(--brick)" } }, fmtBRL(saidas))
      ),
      e("div", { className: "stat-card" },
        e("div", { className: "stat-label" }, "Saldo do período"),
        e("div", { className: "stat-value" }, fmtBRL(entradas - saidas))
      )
    ),

    e("div", { className: "card" },
      e("div", { className: "card-title" }, "Entradas por categoria"),
      byCategory.length === 0 ?
        e(Empty, { icon: "📊", text: "Sem entradas registradas neste período." }) :
        byCategory.map(function (pair) {
          var cat = pair[0], val = pair[1];
          return e("div", { className: "bar-row", key: cat },
            e("div", { style: { width: 150, flexShrink: 0 } }, cat),
            e("div", { className: "bar-track" }, e("div", { className: "bar-fill", style: { width: (val / maxCat * 100) + "%", background: "var(--teal)" } })),
            e("div", { className: "font-mono", style: { width: 90, textAlign: "right", flexShrink: 0 } }, fmtBRL(val))
          );
        })
    ),

    e("div", { className: "card" },
      e("div", { className: "card-title" }, "Clientes que mais compraram"),
      topClients.length === 0 ?
        e(Empty, { icon: "👥", text: "Nenhuma compra vinculada a clientes neste período." }) :
        topClients.map(function (pair, idx) {
          var name = pair[0], val = pair[1];
          return e("div", { key: name, style: { display: "flex", justifyContent: "space-between", padding: "8px 2px", borderBottom: idx < topClients.length - 1 ? "1px solid var(--line)" : "none" } },
            e("span", null, name),
            e("span", { className: "font-mono", style: { fontWeight: 600 } }, fmtBRL(val))
          );
        })
    ),

    e("div", { className: "card" },
      e("div", { className: "list-head" },
        e("div", { className: "card-title", style: { marginBottom: 0 } }, "Histórico do período (" + fmtDate(range.start) + " a " + fmtDate(range.end) + ")"),
        filtered.length > 0 ? e("button", { className: "btn btn-outline btn-sm", onClick: exportarCSV }, Icon("⬇️", 13), " Exportar CSV") : null
      ),
      e(Stitch, { style: { margin: "14px 0" } }),
      filtered.length === 0 ?
        e(Empty, { icon: "📜", text: "Nenhum lançamento neste período." }) :
        e("table", null,
          e("thead", null, e("tr", null,
            e("th", null, "Data"), e("th", null, "Descrição"), e("th", null, "Categoria"), e("th", null, "Cliente"), e("th", null, "Valor")
          )),
          e("tbody", null,
            filtered.map(function (t) {
              return e("tr", { key: t.id },
                e("td", { className: "font-mono", style: { whiteSpace: "nowrap" } }, fmtDate(t.date)),
                e("td", null,
                  e("span", { className: "badge " + (t.type === "entrada" ? "badge-entrada" : "badge-saida"), style: { marginRight: 8 } }, t.type === "entrada" ? "Entrada" : "Saída"),
                  t.description
                ),
                e("td", null, t.category),
                e("td", null, t.clientName || "—"),
                e("td", { className: "font-mono", style: { color: t.type === "entrada" ? "var(--teal-dark)" : "var(--brick)", fontWeight: 600 } },
                  (t.type === "entrada" ? "+" : "-") + fmtBRL(t.value)
                )
              );
            })
          )
        )
    ),

    e("div", { className: "card" },
      e("div", { className: "card-title" }, "Backup dos dados"),
      e("p", { style: { fontSize: 13, color: "var(--ink-soft)", marginTop: -6, marginBottom: 14, lineHeight: 1.5 } },
        "Todos os dados ficam salvos neste navegador. Baixe um backup de vez em quando pra não correr risco de perder o histórico (ex: se limpar o cache do navegador ou trocar de computador)."
      ),
      e("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" } },
        e("button", { className: "btn btn-primary", onClick: exportarBackup }, Icon("⬇️", 15), " Baixar backup completo (JSON)"),
        e("label", { className: "btn btn-outline", style: { cursor: "pointer" } },
          Icon("⬆️", 15), " Restaurar backup",
          e("input", { type: "file", accept: "application/json", style: { display: "none" }, onChange: importarBackup })
        )
      ),
      restoreMsg ? e("div", { className: "form-hint", style: { marginTop: 12, marginBottom: 0 } }, restoreMsg) : null
    )
  );
}

// ---------- inicialização ----------
var root = ReactDOM.createRoot(document.getElementById("root"));
root.render(e(App));

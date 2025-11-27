import { db, auth } from './firebase-config.js';
import { 
    ref, onValue, push, set, update, remove, get, child, runTransaction 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// --- ESTADO GLOBAL ---
let products = [];
let cart = [];
let currentOrder = null;

// --- ELEMENTOS DOM ---
const grid = document.getElementById('product-grid');
const cartContainer = document.getElementById('cart-items');
const cartTotalEl = document.getElementById('cart-total');
const cartCountEl = document.getElementById('cart-count');
const productForm = document.getElementById('product-form');
const invTableBody = document.getElementById('inventory-table-body');
const ordersTableBody = document.getElementById('orders-table-body');

// --- INICIALIZACIÓN ---
// Cargar iconos Lucide
window.addEventListener('load', () => {
    if(window.lucide) window.lucide.createIcons();
    checkUrlForInvoice();
});

function checkUrlForInvoice() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('orderId');
    
    if (orderId) {
        // Modo "Solo ver factura"
        document.getElementById('app-screen').classList.add('hidden'); // Ocultar app
        loadInvoiceData(orderId);
    }
}

// Escuchar Productos en Tiempo Real
const productsRef = ref(db, 'products');
onValue(productsRef, (snapshot) => {
    const data = snapshot.val();
    products = data ? Object.keys(data).map(key => ({id: key, ...data[key]})) : [];
    renderProducts();
    renderInventory();
});

// Escuchar Ordenes
const ordersRef = ref(db, 'orders');
onValue(ordersRef, (snapshot) => {
    const data = snapshot.val();
    const orders = data ? Object.keys(data).map(key => ({id: key, ...data[key]})).reverse() : [];
    renderOrdersHistory(orders);
});

// --- FUNCIONES UI ---

// 1. Renderizar Catálogo (POS)
function renderProducts() {
    const search = document.getElementById('search-input').value.toLowerCase();
    const filtered = products.filter(p => p.name.toLowerCase().includes(search));
    
    grid.innerHTML = filtered.map(p => `
        <div class="bg-white p-4 rounded shadow hover:shadow-lg transition cursor-pointer border ${p.stock < 1 ? 'opacity-50' : ''}" 
             onclick="addToCart('${p.id}')">
            <div class="h-32 bg-gray-100 rounded mb-2 overflow-hidden flex items-center justify-center">
                ${p.imageUrl ? `<img src="${p.imageUrl}" class="w-full h-full object-cover">` : '<span class="text-gray-400">Sin img</span>'}
            </div>
            <h3 class="font-bold text-sm truncate">${p.name}</h3>
            <div class="flex justify-between items-center mt-1">
                <span class="text-indigo-600 font-bold">$${parseFloat(p.price).toFixed(2)}</span>
                <span class="text-xs ${p.stock < 5 ? 'text-red-500 font-bold' : 'text-gray-400'}">Stock: ${p.stock}</span>
            </div>
        </div>
    `).join('');
}
// Escuchar búsqueda
document.getElementById('search-input').addEventListener('input', renderProducts);

// 2. Renderizar Inventario (Tabla)
function renderInventory() {
    invTableBody.innerHTML = products.map(p => `
        <tr class="border-b hover:bg-gray-50">
            <td class="p-3 font-medium">${p.name}</td>
            <td class="p-3 text-sm text-gray-500">${p.category || '-'}</td>
            <td class="p-3 text-right text-gray-400">$${parseFloat(p.cost).toFixed(2)}</td>
            <td class="p-3 text-right font-bold">$${parseFloat(p.price).toFixed(2)}</td>
            <td class="p-3 text-center ${p.stock < 5 ? 'text-red-600 font-bold' : ''}">${p.stock}</td>
            <td class="p-3 text-right">
                <button onclick="deleteProduct('${p.id}')" class="text-red-500 hover:text-red-700">
                   <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');
    if(window.lucide) window.lucide.createIcons();
}

// 3. Renderizar Historial Ordenes
function renderOrdersHistory(orders) {
    ordersTableBody.innerHTML = orders.map(o => `
        <tr class="border-b hover:bg-gray-50">
            <td class="p-3 text-xs font-mono text-gray-500">...${o.id.slice(-6)}</td>
            <td class="p-3 text-sm">${o.dateString}</td>
            <td class="p-3 font-medium text-sm">${o.customer}</td>
            <td class="p-3 text-right font-bold">$${parseFloat(o.total).toFixed(2)}</td>
            <td class="p-3 text-center">
                <button onclick="showInvoice('${o.id}')" class="text-indigo-600 font-bold text-sm">Ver</button>
            </td>
        </tr>
    `).join('');
}

// --- LÓGICA CARRITO ---

window.addToCart = (id) => {
    const prod = products.find(p => p.id === id);
    if (!prod || prod.stock < 1) return alert("Sin stock");
    
    const existing = cart.find(item => item.id === id);
    if (existing) {
        if (existing.qty + 1 > prod.stock) return alert("Stock máximo alcanzado");
        existing.qty++;
    } else {
        cart.push({ ...prod, qty: 1 });
    }
    renderCart();
};

window.removeFromCart = (index) => {
    cart.splice(index, 1);
    renderCart();
};

function renderCart() {
    if (cart.length === 0) {
        cartContainer.innerHTML = '<p class="text-center text-gray-400 mt-10">Vacío</p>';
        cartTotalEl.innerText = "$0.00";
        cartCountEl.innerText = "0";
        return;
    }

    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    const disc = parseFloat(document.getElementById('discount-input').value) || 0;
    const del = parseFloat(document.getElementById('delivery-input').value) || 0;
    const total = subtotal - disc + del;

    cartTotalEl.innerText = `$${total.toFixed(2)}`;
    cartCountEl.innerText = cart.reduce((acc, item) => acc + item.qty, 0);

    cartContainer.innerHTML = cart.map((item, index) => `
        <div class="flex justify-between items-center bg-gray-50 p-2 rounded mb-2">
            <div>
                <p class="font-bold text-sm truncate w-32">${item.name}</p>
                <p class="text-xs text-gray-500">$${item.price} x ${item.qty}</p>
            </div>
            <button onclick="removeFromCart(${index})" class="text-red-400 hover:text-red-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
    `).join('');
    if(window.lucide) window.lucide.createIcons();
}

// Listeners para recalcular total al escribir descuento/envío
document.getElementById('discount-input').addEventListener('input', renderCart);
document.getElementById('delivery-input').addEventListener('input', renderCart);

// --- LÓGICA DE NEGOCIO ---

// Crear Producto
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    // Parsear números
    data.price = parseFloat(data.price);
    data.cost = parseFloat(data.cost);
    data.stock = parseInt(data.stock);

    try {
        await push(ref(db, 'products'), data);
        toggleModal('modal-product');
        productForm.reset();
        alert("Producto guardado");
    } catch (error) {
        alert("Error: " + error.message);
    }
});

// Borrar Producto
window.deleteProduct = async (id) => {
    if(confirm("¿Borrar definitivamente?")) {
        await remove(ref(db, `products/${id}`));
    }
};

// COBRAR (Transacción + Orden)
window.processCheckout = async () => {
    if (cart.length === 0) return alert("Carrito vacío");
    if (!confirm("¿Confirmar venta?")) return;

    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    const discount = parseFloat(document.getElementById('discount-input').value) || 0;
    const delivery = parseFloat(document.getElementById('delivery-input').value) || 0;
    const total = subtotal - discount + delivery;
    const totalCost = cart.reduce((acc, item) => acc + (item.cost * item.qty), 0);
    const customer = document.getElementById('customer-name').value || 'Consumidor Final';

    const newOrder = {
        items: cart,
        subtotal, discount, delivery, total, totalCost, customer,
        date: new Date().toISOString(),
        dateString: new Date().toLocaleString()
    };

    try {
        // 1. Descontar Stock (Seguro con Transacciones)
        const updates = cart.map(item => {
            const stockRef = ref(db, `products/${item.id}/stock`);
            return runTransaction(stockRef, (current) => {
                return (current || 0) - item.qty;
            });
        });
        await Promise.all(updates);

        // 2. Guardar Orden
        const newRef = await push(ref(db, 'orders'), newOrder);
        
        // 3. Limpiar y mostrar factura
        cart = [];
        renderCart();
        document.getElementById('customer-name').value = '';
        document.getElementById('discount-input').value = '';
        document.getElementById('delivery-input').value = '';
        
        showInvoice(newRef.key); // Mostrar factura recién creada

    } catch (error) {
        console.error(error);
        alert("Error en venta (posible falta de stock)");
    }
};

// --- FACTURACIÓN Y UI ---

window.switchView = (viewName) => {
    ['pos', 'inventory', 'orders'].forEach(v => {
        document.getElementById(`view-${v}`).classList.add('hidden');
        document.getElementById(`nav-${v}`).classList.remove('bg-indigo-600', 'text-white');
    });
    document.getElementById(`view-${viewName}`).classList.remove('hidden');
    document.getElementById(`nav-${viewName}`).classList.add('bg-indigo-600', 'text-white');
};

// Cargar Factura desde DB (Para Historial o URL compartida)
window.loadInvoiceData = async (orderId) => {
    try {
        const snapshot = await get(child(ref(db), `orders/${orderId}`));
        if (snapshot.exists()) {
            currentOrder = { id: snapshot.key, ...snapshot.val() };
            renderInvoiceOverlay();
        } else {
            alert("Orden no encontrada");
        }
    } catch (error) {
        alert("Error cargando factura");
    }
};

// Wrapper para llamar desde historial (ya tenemos los datos cargados en memoria si venimos del historial, pero mejor re-buscar por si acaso)
window.showInvoice = (orderId) => {
    loadInvoiceData(orderId);
};

function renderInvoiceOverlay() {
    if(!currentOrder) return;
    
    document.getElementById('inv-id').innerText = `ORDEN #${currentOrder.id.slice(-8).toUpperCase()}`;
    document.getElementById('inv-customer').innerText = currentOrder.customer;
    document.getElementById('inv-date').innerText = currentOrder.dateString;
    
    document.getElementById('inv-items').innerHTML = currentOrder.items.map(item => `
        <tr class="border-b border-gray-100">
            <td class="py-2">${item.name}</td>
            <td class="py-2 text-center">${item.qty}</td>
            <td class="py-2 text-right">$${parseFloat(item.price).toFixed(2)}</td>
            <td class="py-2 text-right font-medium">$${(item.price * item.qty).toFixed(2)}</td>
        </tr>
    `).join('');

    document.getElementById('inv-subtotal').innerText = `$${currentOrder.subtotal.toFixed(2)}`;
    document.getElementById('inv-total').innerText = `$${currentOrder.total.toFixed(2)}`;

    // Manejar visualización de descuento/delivery si existen
    const discRow = document.getElementById('inv-row-disc');
    if(currentOrder.discount > 0) {
        discRow.classList.remove('hidden');
        document.getElementById('inv-disc').innerText = `-$${currentOrder.discount.toFixed(2)}`;
    } else {
        discRow.classList.add('hidden');
    }

    const delRow = document.getElementById('inv-row-del');
    if(currentOrder.delivery > 0) {
        delRow.classList.remove('hidden');
        document.getElementById('inv-del').innerText = `+$${currentOrder.delivery.toFixed(2)}`;
    } else {
        delRow.classList.add('hidden');
    }

    document.getElementById('invoice-view').classList.remove('hidden');
}

window.closeInvoice = () => {
    document.getElementById('invoice-view').classList.add('hidden');
    // Si vinimos por URL, redirigir al inicio limpio
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('orderId')) {
        window.location.href = window.location.pathname;
    }
};

window.copyInvoiceLink = () => {
    if(!currentOrder) return;
    const url = `${window.location.origin}${window.location.pathname}?orderId=${currentOrder.id}`;
    navigator.clipboard.writeText(url);
    alert("Enlace copiado: " + url);
};

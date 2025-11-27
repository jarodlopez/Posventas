import { db, auth } from './firebase-config.js';
import { 
    ref, onValue, push, set, update, remove, get, child, runTransaction 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// --- ESTADO GLOBAL ---
let products = [];
let cart = [];
let currentOrder = null;
let currentOrderId = null; // Para guardar el ID de la orden en el proceso de checkout

// --- ELEMENTOS DOM ---
const grid = document.getElementById('product-grid');
const cartContainer = document.getElementById('cart-items');
const cartSubtotalEl = document.getElementById('cart-subtotal');
const cartDiscountEl = document.getElementById('cart-discount');
const cartDeliveryEl = document.getElementById('cart-delivery');
const cartTotalEl = document.getElementById('cart-total');
const cartCountEl = document.getElementById('cart-count');
const productForm = document.getElementById('product-form');
const checkoutForm = document.getElementById('checkout-form');
const ordersList = document.getElementById('orders-list');
const invTableBody = document.getElementById('inventory-table-body');
const ordersTableBody = document.getElementById('orders-table-body'); // Este no parece usarse, pero lo mantengo
const checkoutButton = document.getElementById('checkout-button');
const finalTotalSpan = document.getElementById('final-total'); // Para el total dentro del modal de cobro

// --- INICIALIZACIÓN ---
// Cargar iconos Lucide y revisar URL
window.addEventListener('load', () => {
    if(window.lucide) window.lucide.createIcons();
    checkUrlForInvoice();
    // Inicializar totales del carrito a $0.00 por si acaso
    updateCartDisplay(); 
});

window.checkUrlForInvoice = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('orderId');
    
    // Solo si estamos logueados (auth.js lo maneja) O si hay un orderId para ver
    if (orderId) {
        // Modo "Solo ver factura"
        const appScreen = document.getElementById('app-screen');
        if (appScreen) appScreen.classList.add('hidden'); // Ocultar app si está visible
        loadInvoiceData(orderId);
    }
}

// Escuchar Productos en Tiempo Real
const productsRef = ref(db, 'products');
onValue(productsRef, (snapshot) => {
    const data = snapshot.val();
    products = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
    renderProducts();
    renderCategoryFilters();
});

// Escuchar Órdenes en Tiempo Real
const ordersRef = ref(db, 'orders');
onValue(ordersRef, (snapshot) => {
    const data = snapshot.val();
    const orders = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })).reverse() : [];
    renderOrders(orders);
});

// --- LÓGICA DE PRODUCTOS ---

// Renderizar la cuadrícula de productos
window.renderProducts = (searchTerm = '', category = '') => {
    if (!grid) return;
    grid.innerHTML = products
        .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) && (category === '' || p.category === category))
        .map(p => `
        <div onclick="addToCart('${p.id}')" class="product-card bg-white p-3 rounded-xl shadow-lg hover:shadow-xl transition transform hover:scale-[1.02] cursor-pointer active:scale-[0.98]">
            <div class="h-24 w-full bg-gray-100 rounded-lg mb-2 overflow-hidden flex items-center justify-center">
                ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" class="h-full w-full object-cover" onerror="this.onerror=null;this.src='https://placehold.co/100x100/9c9c9c/ffffff?text=No+Img';">` : `<i data-lucide="package" class="w-10 h-10 text-indigo-400"></i>`}
            </div>
            <h3 class="font-bold text-gray-800 truncate">${p.name}</h3>
            <p class="text-sm text-gray-500 truncate">${p.category}</p>
            <div class="flex justify-between items-center mt-1">
                <span class="text-lg font-extrabold text-indigo-600">$${p.price.toFixed(2)}</span>
                <span class="text-xs font-semibold ${p.stock <= 5 ? 'text-red-500' : 'text-green-500'}">${p.stock} en stock</span>
            </div>
            <button onclick="event.stopPropagation(); editProduct('${p.id}')" class="absolute top-2 right-2 p-1 bg-yellow-400/80 text-white rounded-full hover:bg-yellow-500 transition">
                <i data-lucide="settings-2" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');
    if(window.lucide) window.lucide.createIcons(); // Re-renderizar iconos

    if (grid.children.length === 0) {
        grid.innerHTML = '<p class="text-center text-gray-500 col-span-full mt-10">No se encontraron productos.</p>';
    }
};

// Renderizar filtros de categoría
window.renderCategoryFilters = () => {
    const select = document.getElementById('category-filter');
    const categories = [...new Set(products.map(p => p.category))].sort();
    
    // Limpiar y añadir la opción por defecto
    select.innerHTML = '<option value="">Todas las Categorías</option>';
    
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });
};

// Filtrar productos
window.filterProducts = () => {
    const searchTerm = document.getElementById('search-input').value;
    const category = document.getElementById('category-filter').value;
    renderProducts(searchTerm, category);
};

// Manejar el formulario de productos
productForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    const isEditing = !!id;
    
    const formData = new FormData(productForm);
    const data = Object.fromEntries(formData.entries());
    
    // Conversión de tipos
    data.price = parseFloat(data.price);
    data.cost = parseFloat(data.cost);
    data.stock = parseInt(data.stock, 10);
    
    // Guardar o Actualizar
    if (isEditing) {
        update(ref(db, `products/${id}`), data)
            .then(() => alertMessage("Producto actualizado con éxito.", "success"))
            .catch(error => alertMessage("Error al actualizar producto: " + error.message, "error"));
    } else {
        push(ref(db, 'products'), data)
            .then(() => alertMessage("Producto agregado con éxito.", "success"))
            .catch(error => alertMessage("Error al agregar producto: " + error.message, "error"));
    }
    
    productForm.reset();
    toggleModal('modal-product');
    document.getElementById('delete-product-btn').classList.add('hidden');
});

// Editar Producto
window.editProduct = (id) => {
    const product = products.find(p => p.id === id);
    if (!product) return alertMessage("Producto no encontrado.", "error");

    document.getElementById('modal-product-title').textContent = 'Editar Producto';
    document.getElementById('product-id').value = product.id;
    productForm.name.value = product.name;
    productForm.description.value = product.description || '';
    productForm.price.value = product.price.toFixed(2);
    productForm.cost.value = product.cost.toFixed(2);
    productForm.stock.value = product.stock;
    productForm.category.value = product.category;
    productForm.imageUrl.value = product.imageUrl || '';
    
    document.getElementById('delete-product-btn').classList.remove('hidden');
    toggleModal('modal-product');
};

// Eliminar Producto
window.deleteProduct = () => {
    const id = document.getElementById('product-id').value;
    // Usar una modal personalizada en lugar de window.confirm()
    const customConfirm = (message, onConfirm) => {
        // En un entorno de iFrame, se usaría un modal propio
        if (confirm(message)) {
            onConfirm();
        }
    };
    
    customConfirm("¿Está seguro de eliminar este producto? Esta acción es irreversible.", () => {
        remove(ref(db, `products/${id}`))
            .then(() => alertMessage("Producto eliminado con éxito.", "success"))
            .catch(error => alertMessage("Error al eliminar producto: " + error.message, "error"));
        
        toggleModal('modal-product');
        productForm.reset();
    });
};

// --- LÓGICA DE CARRITO ---

window.addToCart = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product || product.stock <= 0) {
        return alertMessage("Producto agotado o no encontrado.", "warning");
    }

    const cartItem = cart.find(item => item.id === productId);
    if (cartItem) {
        if (cartItem.qty < product.stock) {
            cartItem.qty += 1;
        } else {
            return alertMessage("No hay más stock disponible para este producto.", "warning");
        }
    } else {
        cart.push({
            id: productId,
            name: product.name,
            price: product.price,
            cost: product.cost,
            qty: 1
        });
    }
    updateCartTotals();
};

window.changeQty = (productId, change) => {
    const cartItem = cart.find(item => item.id === productId);
    const product = products.find(p => p.id === productId);

    if (!cartItem || !product) return;

    cartItem.qty += change;

    if (cartItem.qty <= 0) {
        // Eliminar si la cantidad es 0 o menos
        cart = cart.filter(item => item.id !== productId);
    } else if (cartItem.qty > product.stock) {
        // Prevenir exceso de stock
        cartItem.qty = product.stock;
        alertMessage("Stock máximo alcanzado para este producto.", "warning");
    }
    updateCartTotals();
};

window.clearCart = () => {
    // Usar una modal personalizada en lugar de window.confirm()
    const customConfirm = (message, onConfirm) => {
        if (confirm(message)) {
            onConfirm();
        }
    };

    customConfirm("¿Estás seguro de vaciar el carrito?", () => {
        cart = [];
        updateCartTotals();
        // Resetear campos del modal de checkout por si acaso
        document.getElementById('delivery-fee-input').value = '0.00';
        document.getElementById('discount-input').value = '0.00';
    });
};

window.updateCartTotals = () => {
    let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    // Obtener valores de delivery y descuento del modal (si están visibles)
    const discountInput = document.getElementById('discount-input');
    const deliveryInput = document.getElementById('delivery-fee-input');
    
    let discount = 0;
    if (discountInput) {
        discount = parseFloat(discountInput.value) || 0;
    }
    
    let delivery = 0;
    const deliveryRadio = document.querySelector('input[name="saleType"][value="delivery"]');
    if (deliveryRadio && deliveryRadio.checked && deliveryInput) {
        delivery = parseFloat(deliveryInput.value) || 0;
    }

    let total = subtotal - discount + delivery;

    // Asegurar que el descuento no sea mayor al subtotal (opcional, pero buena práctica)
    if (discount > subtotal) {
        discount = subtotal;
        total = delivery;
        discountInput.value = discount.toFixed(2);
    }

    // Actualizar el estado global del carrito (para el proceso de checkout)
    currentOrder = {
        subtotal: subtotal,
        discount: discount,
        delivery: delivery,
        total: total,
        items: cart,
    };
    
    updateCartDisplay();
};

const updateCartDisplay = () => {
    if (!cartContainer || !currentOrder) return;

    // Actualizar items
    if (cart.length === 0) {
        cartContainer.innerHTML = `
            <div id="cart-empty-state" class="text-center text-gray-500 mt-10">
                <i data-lucide="shopping-cart" class="w-12 h-12 mx-auto mb-2"></i>
                <p>El carrito está vacío. Agrega productos.</p>
            </div>
        `;
    } else {
        cartContainer.innerHTML = currentOrder.items.map(item => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg shadow-sm">
                <div class="flex-1 min-w-0 mr-4">
                    <p class="font-semibold truncate">${item.name}</p>
                    <p class="text-sm text-gray-500">$${item.price.toFixed(2)} c/u</p>
                </div>
                <div class="flex items-center space-x-2">
                    <button onclick="changeQty('${item.id}', -1)" class="p-1 text-red-500 border border-red-500 rounded-full hover:bg-red-500 hover:text-white transition">
                        <i data-lucide="minus" class="w-4 h-4"></i>
                    </button>
                    <span class="font-bold w-6 text-center">${item.qty}</span>
                    <button onclick="changeQty('${item.id}', 1)" class="p-1 text-green-500 border border-green-500 rounded-full hover:bg-green-500 hover:text-white transition">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                    </button>
                </div>
                <span class="font-bold text-gray-800 w-20 text-right ml-4">$${(item.price * item.qty).toFixed(2)}</span>
            </div>
        `).join('');
    }
    
    // Actualizar totales y contador
    cartSubtotalEl.innerText = `$${currentOrder.subtotal.toFixed(2)}`;
    cartDiscountEl.innerText = `-$${currentOrder.discount.toFixed(2)}`;
    cartDeliveryEl.innerText = `+$${currentOrder.delivery.toFixed(2)}`;
    cartTotalEl.innerText = `$${currentOrder.total.toFixed(2)}`;
    cartCountEl.innerText = cart.length;

    // Actualizar botón de cobro y total final en el modal
    finalTotalSpan.innerText = `$${currentOrder.total.toFixed(2)}`;
    
    // Deshabilitar botón de cobro si el carrito está vacío
    if (checkoutButton) {
        checkoutButton.disabled = cart.length === 0;
    }

    if(window.lucide) window.lucide.createIcons(); // Re-renderizar iconos
};

// --- LÓGICA DE CHECKOUT (COBRO) ---

window.openCheckoutModal = () => {
    if (cart.length === 0) {
        return alertMessage("El carrito está vacío, no se puede cobrar.", "warning");
    }
    
    // Aplicar los totales actuales al modal antes de abrir
    updateCartTotals(); 
    document.getElementById('final-total').innerText = `$${currentOrder.total.toFixed(2)}`;

    // Resetear el formulario del modal
    checkoutForm.reset();
    
    // Asegurar que el estado inicial del delivery sea correcto
    window.toggleDeliveryFields(); 
    
    // Abrir el modal
    toggleModal('modal-checkout');
};

window.closeCheckoutModal = () => {
    toggleModal('modal-checkout');
};


checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (cart.length === 0) {
        return alertMessage("El carrito está vacío, no se puede completar la venta.", "warning");
    }

    // Deshabilitar botón para prevenir doble click
    const confirmBtn = document.getElementById('confirm-sale-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Procesando...';

    const formData = new FormData(checkoutForm);
    const saleData = Object.fromEntries(formData.entries());

    // Agregar datos finales del carrito
    const now = new Date();
    const newOrder = {
        ...currentOrder, // subtotal, total, items, discount, delivery
        ...saleData, // customerName, phone, paymentMethod, saleType, address, etc.
        timestamp: now.toISOString(),
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        userId: auth.currentUser ? auth.currentUser.uid : 'anon',
        status: 'Completada',
        discount: parseFloat(saleData.discount) || 0,
        deliveryFee: parseFloat(saleData.deliveryFee) || 0,
        // Usar el total calculado previamente para evitar errores de redondeo en el momento de la venta
        finalTotal: currentOrder.total 
    };
    
    // Limpiar campos no necesarios o recalcular si es necesario (el updateCartTotals ya hizo la mayor parte)
    delete newOrder.deliveryFee; // Lo movemos a delivery
    newOrder.delivery = newOrder.deliveryFee; // Usamos la propiedad delivery ya calculada

    // Procesar la venta: guardar la orden y actualizar el stock
    try {
        // 1. Guardar la orden
        const orderRef = push(ref(db, 'orders'), newOrder);
        currentOrderId = orderRef.key;

        // 2. Actualizar stock para cada item del carrito
        const stockUpdates = {};
        for (const item of cart) {
            const product = products.find(p => p.id === item.id);
            if (product) {
                stockUpdates[`products/${item.id}/stock`] = product.stock - item.qty;
            }
        }
        await update(ref(db), stockUpdates);

        // 3. Limpiar y mostrar éxito
        cart = [];
        updateCartTotals();
        closeCheckoutModal();
        alertMessage(`Venta ${currentOrderId} completada con éxito.`, "success");
        
        // 4. Mostrar factura para impresión
        loadInvoiceData(currentOrderId);

    } catch (error) {
        console.error("Error al completar la venta:", error);
        alertMessage("Error al procesar la venta. Intente de nuevo.", "error");
    } finally {
        // Restaurar botón
        confirmBtn.disabled = false;
        confirmBtn.textContent = `Confirmar Venta ($${currentOrder.total.toFixed(2)})`;
    }
});

// --- LÓGICA DE ÓRDENES ---

window.renderOrders = (orders) => {
    if (!ordersList) return;
    
    if (orders.length === 0) {
        document.getElementById('orders-empty-state').classList.remove('hidden');
        ordersList.innerHTML = '';
        return;
    }
    
    document.getElementById('orders-empty-state').classList.add('hidden');
    
    ordersList.innerHTML = orders.map(order => `
        <div class="p-4 bg-gray-50 rounded-xl shadow-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition" onclick="loadInvoiceData('${order.id}')">
            <div class="flex justify-between items-center mb-1">
                <span class="text-sm font-semibold text-indigo-600">ID: ${order.id.substring(0, 8)}...</span>
                <span class="text-xs text-gray-500">${order.date} ${order.time}</span>
            </div>
            <p class="font-bold text-lg">$${order.finalTotal.toFixed(2)}</p>
            <p class="text-sm text-gray-700">${order.customerName || 'Cliente Genérico'}</p>
            <div class="mt-2 text-xs flex justify-between">
                <span class="px-2 py-0.5 rounded-full ${order.status === 'Completada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${order.status}</span>
                <span class="text-indigo-500 font-medium">${order.paymentMethod}</span>
            </div>
        </div>
    `).join('');
};

window.changeView = (viewId) => {
    const cartView = document.getElementById('view-cart');
    const ordersView = document.getElementById('view-orders');
    
    if (viewId === 'view-orders') {
        cartView.classList.add('hidden');
        ordersView.classList.remove('hidden');
    } else {
        cartView.classList.remove('hidden');
        ordersView.classList.add('hidden');
    }
};


// --- LÓGICA DE FACTURA (INVOICE) ---

window.loadInvoiceData = async (orderId) => {
    try {
        const orderSnapshot = await get(child(ref(db, 'orders'), orderId));
        if (!orderSnapshot.exists()) {
            return alertMessage("Factura no encontrada.", "error");
        }

        const order = { id: orderId, ...orderSnapshot.val() };
        window.currentOrder = order; // Guardar globalmente para compartir

        renderInvoice(order);

    } catch (error) {
        console.error("Error al cargar la factura:", error);
        alertMessage("Error al cargar la factura.", "error");
    }
};

window.renderInvoice = (order) => {
    const contentEl = document.getElementById('invoice-content');
    if (!contentEl) return;

    // Crear la tabla de items
    const itemsTable = order.items.map(item => `
        <tr>
            <td class="py-2 pr-4 text-left">${item.name}</td>
            <td class="py-2 px-4 text-center">${item.qty}</td>
            <td class="py-2 px-4 text-right">$${item.price.toFixed(2)}</td>
            <td class="py-2 pl-4 text-right font-bold">$${(item.price * item.qty).toFixed(2)}</td>
        </tr>
    `).join('');

    // Rellenar el contenido de la factura
    contentEl.innerHTML = `
        <div class="text-center mb-6">
            <h1 class="text-3xl font-extrabold text-indigo-700">FACTURA DE VENTA</h1>
            <p class="text-sm text-gray-500">ID de Venta: ${order.id}</p>
            <p class="text-sm text-gray-500">Fecha: ${order.date} | Hora: ${order.time}</p>
        </div>
        
        <div class="mb-6 p-4 border rounded-lg bg-gray-50">
            <h2 class="font-bold mb-2 text-gray-700">Detalles del Cliente</h2>
            <p class="text-sm"><strong>Cliente:</strong> ${order.customerName || 'Cliente Genérico'}</p>
            <p class="text-sm"><strong>Teléfono:</strong> ${order.customerPhone || 'N/A'}</p>
            ${order.saleType === 'delivery' ? 
                `<p class="text-sm"><strong>Dirección:</strong> ${order.customerAddress}</p>` 
                : '<p class="text-sm"><strong>Tipo:</strong> Venta Local/Retiro</p>'}
        </div>

        <table class="w-full mb-6 border-collapse">
            <thead>
                <tr class="bg-indigo-100 text-indigo-700">
                    <th class="py-2 pr-4 text-left rounded-tl-lg">Producto</th>
                    <th class="py-2 px-4 text-center">Cant.</th>
                    <th class="py-2 px-4 text-right">Precio</th>
                    <th class="py-2 pl-4 text-right rounded-tr-lg">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsTable}
            </tbody>
        </table>
        
        <div class="flex justify-end">
            <div class="w-full max-w-xs space-y-1">
                <div class="flex justify-between font-medium">
                    <span>Subtotal:</span>
                    <span>$${order.subtotal.toFixed(2)}</span>
                </div>
                <div class="flex justify-between text-green-600 font-medium">
                    <span>Descuento:</span>
                    <span>-$${order.discount.toFixed(2)}</span>
                </div>
                <div class="flex justify-between text-yellow-600 font-medium">
                    <span>Delivery:</span>
                    <span>+$${order.delivery.toFixed(2)}</span>
                </div>
                <div class="flex justify-between font-extrabold text-2xl text-indigo-700 pt-2 border-t-2 border-indigo-200">
                    <span>TOTAL PAGADO:</span>
                    <span>$${order.finalTotal.toFixed(2)}</span>
                </div>
            </div>
        </div>
        
        <div class="mt-6 pt-4 border-t text-center">
            <p class="text-sm">Método de Pago: <strong class="text-indigo-600">${order.paymentMethod}</strong></p>
            <p class="text-xs text-gray-500 mt-2">¡Gracias por su compra! Vuelva pronto.</p>
        </div>
    `;

    document.getElementById('invoice-view').classList.remove('hidden');
    // Si la pantalla principal está visible, la ocultamos
    const appScreen = document.getElementById('app-screen');
    if (appScreen && !appScreen.classList.contains('hidden')) {
        appScreen.classList.add('hidden');
    }
};

window.closeInvoice = () => {
    document.getElementById('invoice-view').classList.add('hidden');
    // Asegurar que la pantalla principal se muestre si el usuario está logueado
    if (auth.currentUser) {
        document.getElementById('app-screen').classList.remove('hidden');
    }

    // Si vinimos por URL, redirigir al inicio limpio
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('orderId')) {
        window.location.href = window.location.pathname;
    }
};

window.copyInvoiceLink = () => {
    if(!window.currentOrder || !window.currentOrder.id) {
        return alertMessage("No hay factura para compartir.", "warning");
    }

    // Generar el link para WhatsApp con un texto predefinido
    const invoiceUrl = `${window.location.origin}${window.location.pathname}?orderId=${window.currentOrder.id}`;
    
    // Contenido del mensaje de WhatsApp
    const message = `¡Hola! Aquí está el detalle de tu compra (ID: ${window.currentOrder.id.substring(0, 8)}...):\n\nTotal Pagado: $${window.currentOrder.finalTotal.toFixed(2)}\n\nMétodo: ${window.currentOrder.paymentMethod}\n\nPuedes ver la factura completa aquí: ${invoiceUrl}`;
    
    // Codificar el mensaje para la URL de WhatsApp
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank');
    alertMessage("Link de WhatsApp abierto en una nueva pestaña.", "success");
};


// --- UTILIDADES ---

// Función de Alerta Personalizada (Reemplazo de alert())
function alertMessage(message, type = 'info') {
    console.log(`[${type.toUpperCase()}]: ${message}`);
    
    // Implementar un modal o toast de notificación aquí.
    // Por ahora, solo usamos la consola para evitar bloquear el iFrame.
    const containerId = 'toast-container';
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.className = 'fixed top-4 right-4 z-[9999] space-y-2';
        document.body.appendChild(container);
    }
    
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
    };
    
    const toast = document.createElement('div');
    toast.className = `${colors[type]} text-white p-3 rounded-lg shadow-xl max-w-xs transition-all duration-300 transform opacity-0 translate-x-full`;
    toast.textContent = message;
    container.appendChild(toast);
    
    // Animar entrada
    setTimeout(() => {
        toast.classList.remove('opacity-0', 'translate-x-full');
        toast.classList.add('opacity-100', 'translate-x-0');
    }, 10);
    
    // Animar salida y remover
    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-x-0');
        toast.classList.add('opacity-0', 'translate-x-full');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 4000);
}

// Inicializar el carrito la primera vez
updateCartTotals();

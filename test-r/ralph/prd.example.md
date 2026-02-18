# E-Commerce Shopping Cart

Ralph also supports prd.md as an alternative to prd.json.
This file is an EXAMPLE to show you the markdown format.
To use it, rename it to prd.md and place it in your project root (or keep it in ralph/).

## setup: Project Setup

Initialize the Next.js project with TypeScript, Tailwind CSS, and Prisma.
Install all required dependencies. Set up the database schema for products,
carts, and cart items.

### Acceptance Criteria
- Project builds with no errors
- Database migrations run successfully
- Tailwind CSS is configured and working
- A basic health-check endpoint returns 200

### Validate
- `npm run build`
- `npm test`

## product-catalog: Product Catalog API

Build CRUD endpoints for products. Each product has a name, description,
price (in cents), imageUrl, and stock count. Add pagination to the
GET /api/products listing endpoint (default 20 per page).

### Acceptance Criteria
- GET /api/products returns paginated product list
- GET /api/products/:id returns a single product
- POST /api/products creates a product (admin only)
- PUT /api/products/:id updates a product (admin only)
- Products with stock 0 show as "out of stock"

### Dependencies
- setup

### Validate
- `npm test`
- `npx tsc --noEmit`

## cart: Shopping Cart

Implement the shopping cart. Users can add items, update quantities,
remove items, and view their cart. Cart persists across sessions using
the session token. Cart total should be calculated server-side.

### Acceptance Criteria
- POST /api/cart/items adds a product to the cart
- PATCH /api/cart/items/:id updates quantity
- DELETE /api/cart/items/:id removes an item
- GET /api/cart returns all items with calculated total
- Cannot add more items than available stock
- Cart is tied to the authenticated user's session

### Dependencies
- setup
- product-catalog

## checkout: Checkout Flow

Build the checkout endpoint that takes a cart, validates stock availability,
creates an order, decrements stock counts, and clears the cart. This should
be wrapped in a database transaction so partial failures roll back cleanly.

### Acceptance Criteria
- POST /api/checkout creates an order from the current cart
- Stock is decremented atomically
- Out-of-stock items fail the entire checkout (transaction rollback)
- Cart is cleared after successful checkout
- Order confirmation includes order ID and total

### Dependencies
- cart
- product-catalog

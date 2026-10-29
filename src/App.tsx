import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { CartProvider } from "@/lib/cart";
import { ProductsProvider } from "@/lib/products-store";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import Home from "@/pages/home";
import Products from "@/pages/products";
import ProductDetail from "@/pages/product-detail";
import Admin from "@/pages/admin";
import OrderPage from "@/pages/order";
import NotFound from "@/pages/not-found";

export default function App() {
  return (
    <ProductsProvider>
      <CartProvider>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/produtos" element={<Products />} />
              <Route path="/produtos/:id" element={<ProductDetail />} />
              <Route path="/pedido/:publicId" element={<OrderPage />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <SiteFooter />
        </div>
        <Toaster position="top-center" />
      </CartProvider>
    </ProductsProvider>
  );
}

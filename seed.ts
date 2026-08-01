import "dotenv/config";
import connectDB from "./config/db.js";
import Product, { IProduct } from "./models/Product.js";
import User from "./models/User.js";
import Category, { ICategory } from "./models/Category.js";
import HeroSlide, { IHeroSlide } from "./models/HeroSlide.js";
import Outlet, { IOutlet } from "./models/Outlet.js";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const seedProducts: IProduct[] = [
  {
    title: "Classic Yellow Polo with Black Collar",
    slug: slugify("Classic Yellow Polo with Black Collar"),
    sku: "TB-POLO-001",
    image:
      "https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=800&h=800&q=75&auto=format&fit=crop",
    price: 720,
    originalPrice: 890,
    badge: "Half/Drop Available",
    category: "polo",
    collections: ["polo"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    stockQuantity: 100,
    inStock: true,
  },
  {
    title: "Drop Shoulder T-Shirt (Spiderman BND)",
    slug: slugify("Drop Shoulder T-Shirt (Spiderman BND)"),
    sku: "TB-DS-002",
    image:
      "https://images.unsplash.com/photo-1622445275576-721325763afe?w=800&h=800&q=75&auto=format&fit=crop",
    price: 560,
    originalPrice: 590,
    badge: "Half/Drop Available",
    category: "drop-shoulder",
    collections: ["drop-shoulder"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    stockQuantity: 120,
    inStock: true,
  },
  {
    title: "Kids Solid T-Shirt - Pink",
    slug: slugify("Kids Solid T-Shirt - Pink"),
    sku: "TB-KID-003",
    image:
      "https://images.unsplash.com/photo-1556906781-9a412961c28c?w=800&h=800&q=75&auto=format&fit=crop",
    price: 250,
    originalPrice: 299,
    badge: "Half/Drop Available",
    category: "kiddo",
    collections: ["kiddo"],
    sizes: ["S", "M", "L"],
    stockQuantity: 80,
    inStock: true,
  },
  {
    title: "Solid T Shirt - Pure Black",
    slug: slugify("Solid T Shirt - Pure Black"),
    sku: "TB-SLD-004",
    image:
      "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&h=800&q=75&auto=format&fit=crop",
    price: 320,
    originalPrice: 350,
    badge: "Most Wanted",
    category: "solid",
    collections: ["solid"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    stockQuantity: 200,
    inStock: true,
  },
  {
    title: "Half Sleeve Turtle Neck (Black)",
    slug: slugify("Half Sleeve Turtle Neck (Black)"),
    sku: "TB-TN-005",
    image:
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=800&q=75&auto=format&fit=crop",
    price: 399,
    category: "turtle-neck",
    collections: ["turtle-neck"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    stockQuantity: 60,
    inStock: true,
  },
  {
    title: "Premium Solid Polo: Navy Blue",
    slug: slugify("Premium Solid Polo: Navy Blue"),
    sku: "TB-POLO-006",
    image:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=800&q=75&auto=format&fit=crop",
    price: 499,
    originalPrice: 790,
    category: "polo",
    collections: ["polo"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    stockQuantity: 90,
    inStock: true,
  },
  {
    title: "Deshi Talk T Shirt: Asol",
    slug: slugify("Deshi Talk T Shirt: Asol"),
    sku: "TB-DSIGN-007",
    image:
      "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&h=800&q=75&auto=format&fit=crop",
    price: 560,
    originalPrice: 590,
    badge: "Half/Drop Available",
    category: "deshi-talk",
    collections: ["deshi-talk"],
    signatureSeries: ["deshi-talk"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    stockQuantity: 75,
    inStock: true,
  },
  {
    title: "Best Deal: Solid Polo (3 Pieces)",
    slug: slugify("Best Deal: Solid Polo (3 Pieces)"),
    sku: "TB-DEAL-008",
    image:
      "https://images.unsplash.com/photo-1562157873-818bc0726f68?w=800&h=800&q=75&auto=format&fit=crop",
    price: 1299,
    originalPrice: 2370,
    badge: "Best Deal",
    category: "best-deal",
    collections: ["best-deal", "polo"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    stockQuantity: 50,
    inStock: true,
  },
];

const seedCategories: ICategory[] = [
  { title: "Drop Shoulder", slug: "drop-shoulder", type: "collection", order: 1 },
  { title: "Polo Perfection", slug: "polo", type: "collection", order: 2 },
  { title: "Pure Solid", slug: "solid", type: "collection", order: 3 },
  { title: "Turtle Neck", slug: "turtle-neck", type: "collection", order: 4 },
  { title: "Kiddo", slug: "kiddo", type: "collection", order: 5 },
  { title: "Deshi Talk", slug: "deshi-talk", type: "signature", order: 1 },
  { title: "Banglar Khadok", slug: "banglar-khadok", type: "signature", order: 2 },
  { title: "Best Deal", slug: "best-deal", type: "budget", order: 1 },
  { title: "Caps", slug: "cap", type: "accessory", order: 1 },
  { title: "Socks", slug: "socks", type: "accessory", order: 2 },
];

const seedHeroSlides: IHeroSlide[] = [
  {
    eyebrow: "Big Sale",
    title: "BD's Biggest Drop Shoulder Lineup",
    subtitle:
      "Fresh drops, premium fabrics and the most wanted fits — all at unbeatable prices.",
    cta: "Shop the Sale",
    link: "/big-sale",
    image:
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1920&h=1080&q=75&auto=format&fit=crop",
    order: 1,
  },
  {
    eyebrow: "New In",
    title: "Drop Shoulder T-Shirts",
    subtitle:
      "Oversized, comfortable and made for everyday swag. Explore the full collection.",
    cta: "Shop Drop Shoulder",
    link: "/collections/drop-shoulder",
    image:
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=1920&h=1080&q=75&auto=format&fit=crop",
    order: 2,
  },
  {
    eyebrow: "Signature Series",
    title: "Wear Bangladesh",
    subtitle:
      "Deshi pride, bold statements and quality you can trust. Signature series drops.",
    cta: "Explore Signature",
    link: "/signature-series",
    image:
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1920&h=1080&q=75&auto=format&fit=crop",
    order: 3,
  },
  {
    eyebrow: "Polo Perfection",
    title: "Premium Solid Polos",
    subtitle: "Classic collars, premium cotton and colours that pop. From ৳499.",
    cta: "Shop Polos",
    link: "/collections/polo",
    image:
      "https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=1920&h=1080&q=75&auto=format&fit=crop",
    order: 4,
  },
];

const seedOutlets: IOutlet[] = [
  {
    name: "Mirpur Flagship Store",
    area: "Mirpur 10, Dhaka",
    hours: "10:00 AM – 10:00 PM",
    phone: "+880 1XXX-XXXXXX",
  },
  {
    name: "Dhanmondi Store",
    area: "Road 27, Dhanmondi, Dhaka",
    hours: "10:00 AM – 10:00 PM",
    phone: "+880 1XXX-XXXXXX",
  },
  {
    name: "Gulshan Store",
    area: "Gulshan 2, Dhaka",
    hours: "11:00 AM – 9:00 PM",
    phone: "+880 1XXX-XXXXXX",
  },
  {
    name: "Uttara Store",
    area: "Uttara Sector 7, Dhaka",
    hours: "10:00 AM – 10:00 PM",
    phone: "+880 1XXX-XXXXXX",
  },
  {
    name: "Chattogram Store",
    area: "GEC Circle, Chattogram",
    hours: "10:00 AM – 9:30 PM",
    phone: "+880 1XXX-XXXXXX",
  },
  {
    name: "Sylhet Store",
    area: "Zindabazar, Sylhet",
    hours: "10:00 AM – 9:00 PM",
    phone: "+880 1XXX-XXXXXX",
  },
];

async function seed(): Promise<void> {
  await connectDB();

  await Product.deleteMany({});
  await Product.insertMany(seedProducts);

  await Category.deleteMany({});
  await Category.insertMany(seedCategories);

  await HeroSlide.deleteMany({});
  await HeroSlide.insertMany(seedHeroSlides);

  await Outlet.deleteMany({});
  await Outlet.insertMany(seedOutlets);

  const exists = await User.findOne({ email: "admin@tobarok.com" });
  if (!exists) {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!adminPassword) {
      console.warn(
        "SEED_ADMIN_PASSWORD is not set. Skipping default admin creation."
      );
    } else {
      await User.create({
        name: "Admin",
        email: "admin@tobarok.com",
        password: adminPassword,
        role: "superadmin",
        emailVerified: true,
      });
    }
  }
  console.log("Seed complete");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

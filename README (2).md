
# Minicuration — Trading Card Art Prints

![Hero](1000029606.jpg)

**Limited edition prints** (50 per design) of original paintings on trading card-sized canvas, sealed in acrylic collector cases. Hover to flip cards and read artist details on the back.

## 📁 Folder Structure

```
minicuration/
├── index.html          ← Landing page
├── shop.html           ← E-commerce shop page
├── 1000029606.jpg      ← Dreamfall (front)
├── 1000029634.jpg      ← Dreamfall (back)
├── 1000029600.jpg      ← PIUMA (front)  
├── 1000029633.jpg      ← PIUMA (back)
├── 1000029645.jpg      ← Dream Mountain (front)
└── 1000029632.jpg      ← Dream Mountain (back)
```

## 🚀 Deployment (3 min)

### GitHub Pages (Free)
```
1. Create repo named "minicuration"
2. Upload ALL 8 files above
3. Go to Settings → Pages → Source: Deploy from branch → main → Save
4. Live at: https://yourusername.github.io/minicuration
```

### Vercel (Free)
```
1. vercel.com → New Project → Import Git repo
2. Upload files to repo → Deploy
3. Live URL: minicuration.vercel.app
```

### Netlify (Free)
```
1. netlify.com → Drag/drop entire folder
2. Instant live site
```

## 💳 Stripe Integration

1. Go to [dashboard.stripe.com/payment-links](https://dashboard.stripe.com/payment-links)
2. **Create Payment Link** for each card → Price: $45
3. **Create Buy Button** → Copy embed code
4. In `shop.html`, find `<!-- REPLACE THIS BUTTON -->` (3 places)
5. Replace `<a href="#" class="btn-buy">Buy Now — $45</a>` with your Stripe snippet:

```html
<stripe-buy-button
  buy-button-id="buy_btn_XXXXXXXXXX"
  publishable-key="pk_live_XXXXXXXXXX"
></stripe-buy-button>
```

6. Delete the blue Stripe setup notice: `<div class="stripe-notice">...</div>`
7. Redeploy ✅

## 🎨 Features

- **3D card flip** — Hover/click to reveal back with artist info
- **Filter** — All / Available / Sold
- **Detail modals** — Full card info + flip
- **Mobile responsive** — Perfect on phone/desktop
- **Smooth animations** — Lift/glow on hover
- **Static site** — No backend, instant load

## 🛠️ Customization

| Change | File | Line |
|--------|------|------|
| Prices | `shop.html` | Card `.card-price` |
| New cards | `shop.html` | Copy card block + update images |
| Sold out | `shop.html` | `data-status="sold"` |
| Colors | Both | CSS `:root` vars |
| Logo | Both | `.nav-logo` |

## 📱 Mobile Preview
Cards stack vertically, flip works with tap, modals full-screen.

## 🔗 Sister Sites
- [jfeelgood.com](https://jfeelgood.com)
- [iexploreart.com](https://iexploreart.com)

---

**Built for jfeelgoodofficial.github.io/minicuration** — Live demo: [your-site.com](https://your-site.com)

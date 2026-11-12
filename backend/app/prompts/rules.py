"""
BigBasket Catalog Classification Rules and Regulatory Criteria.
Defines explicit guidelines for FOOD, NON-FOOD, and KITCHEN_ITEMS categories,
including Multi-Object Cookware Set & Kitchen Kit identification.
"""

CATEGORY_RULES = """
=== CLASSIFICATION CATEGORY RULES & CRITERIA ===

1. "FOOD" CATEGORY:
   - Scope: Any product intended for human ingestion or culinary consumption.
   - Subcategories: Fresh Fruits, Vegetables, Packaged Food, Snacks & Biscuits, Beverages (Juices, Tea, Coffee, Soft Drinks), Dairy & Eggs, Bakery, Frozen Foods, Meat & Seafood, Grains, Pulses, Atta & Flours, Edible Oils & Ghee, Spices & Masalas, Sauces, Pickles, Jams, Sweets & Namkeen.
   - Regulatory Indicators: Look for FSSAI green/brown veg/non-veg logos, 14-digit FSSAI license numbers, Nutritional Facts panel, Ingredients list, Allergen warnings.
   - Processing Requirements: Preserve natural food color fidelity, preserve organic surface texture, and avoid clipping natural product boundaries.

2. "NON_FOOD" CATEGORY:
   - Scope: General non-edible consumer merchandise and household FMCG.
   - Subcategories: Personal Care (Shampoo, Conditioners, Hair Oils, Soaps, Bodywash, Lotions, Creams, Cosmetics, Perfumes, Oral Care), Home Care (Detergents, Fabric Softeners, Surface Cleaners, Dishwash Liquids), Plasticware (Buckets, Basins, Storage Tubs, Dustbins), Paper & Tissues, Diapers & Sanitary Care, Electronics, Batteries, Lighting, Stationery, Pet Supplies.
   - Regulatory Indicators: Statutory consumer notices ("For external use only", "Keep out of reach of children", directions for use, net content in ml/g/pieces).
   - Exemptions: Automatically exempt from FSSAI and nutritional panel requirements.
   - Processing Requirements: Preserve geometric product shapes, glossy labels, reflective brand packaging, and protect caps/nozzles/pumps.

3. "KITCHEN_ITEMS" CATEGORY:
   - Scope: All cookware, cooking appliances, utensils, food preparation tools, and dining/storage hardware.
   - IMPORTANT NOTE: Even though kitchen items are non-edible, they MUST be classified as "KITCHEN_ITEMS" (NOT "NON_FOOD"). Kitchen items trigger specialized image processing pipelines for metallic sheen preservation, glass transparency protection, and handle/knob retention.
   - Subcategories: Cookware (Pressure Cookers, Frying Pans, Kadai, Pots, Tawas, Saucepans, Cookware Sets), Kitchen Utensils (Spoons, Spatulas, Ladles, Tongs, Whisks), Cutlery & Knives, Glass Containers & Storage Jars, Bakeware, Strainers, Sieves, Graters, Cutting Boards.
   - Materials to identify dynamically:
     * STAINLESS_STEEL, ALUMINIUM, CAST_IRON, COPPER, BRASS
     * GLASS, BOROSILICATE_GLASS
     * CERAMIC, PORCELAIN
     * PLASTIC, POLYPROPYLENE, BAKELITE_PLASTIC
     * SILICONE, RUBBER
     * WOOD, BAMBOO
     * NON_STICK_COATING, ENAMEL, COMPOSITE
   - Physical Components to identify dynamically:
     * HANDLES (long handles, side handles, loop handles, helper handles)
     * LIDS (glass lids, metal lids, inner-lid, outer-lid)
     * KNOBS (lid knobs, pressure regulator knobs)
     * SPOUTS, RIMS, EDGES
     * BLADES, CUTTING_SURFACES
     * MESH, SIEVE_WIRE, PERFORATIONS
     * HINGES, JOINTS, RIVETS, FEET, BASES
     * TRANSPARENT_SECTIONS
   - Visual Properties to identify:
     * METALLIC, REFLECTIVE, GLOSSY, TRANSPARENT_GLASS, SEMI_TRANSPARENT, THIN_HANDLES

   - MULTI-OBJECT KITCHENWARE & COMBO SET IDENTIFICATION:
     * When an image contains multiple cookware items or a kitchen kit (e.g., cooking pot + saucepans + frying pans + glass lids):
       - Set "is_multi_product_image": true.
       - Set "total_detected_products": total number of identifiable cookware items.
       - In "detected_products", break down EACH item:
         1) "product_type": Specific item type (e.g. COOKING_POT, SAUCEPAN, FRYING_PAN, PRESSURE_COOKER, SPATULA, GLASS_LID).
         2) "quantity": Count of this product type.
         3) "components": Parts belonging to this product (e.g., BODY, SIDE_HANDLES, LONG_HANDLE, GLASS_LID, KNOB, RIM).
         4) "materials": Specific materials for this item (e.g., NON_STICK_COATING, ALUMINIUM, GLASS, BAKELITE_PLASTIC).
         5) "bounding_box": Normalized [ymin, xmin, ymax, xmax] coordinates (0 to 1000) if identifiable.
       - Do NOT confuse components (such as handles, lids, and knobs) with independent products. Assign components to their respective parent item.
       - Processing Directive: Preserve the COMPLETE composite set image. Never slice or drop items. Ensure Photoroom background removal protects all handles, glass transparency, non-stick coatings, and thin edges across all detected items.

4. "UNKNOWN" CATEGORY:
   - If the image is heavily cropped, blurry, ambiguous, or lacks identifiable product features, return "UNKNOWN" and set "requires_manual_review": true.
   - NEVER guess or invent product categories when uncertain.
"""

IMAGE_ROLE_RULES = """
=== STRICT IMAGE TYPE / ROLE CLASSIFICATION RULES ===
You must classify image_type into exactly ONE of the following:

1. "FOP" (Front-of-Pack / Primary Hero Product Shot):
   - Scope: The primary front, 3/4 perspective, top view, or hero studio shot showcasing the standalone sellable product (or complete multi-piece kit sold together) in its normal upright orientation for catalog listing.
   - STRICT CRITERIA: Classify as "FOP" when the frame shows the sellable product on a plain, white, or neutral studio backdrop—even if there are studio cast shadows, surface reflections, or minimal background texture/foam/smear accents—with no human models, no marketing callouts, no real-world environment, and no separate surrounding prop objects.

2. "BOP" (Back-of-Pack / Rear / Underside / Bottom / Inverted View):
   - Scope: The rear face, back panel, underside, bottom base, or inverted view of the product.
   - Packaged goods: The rear face showing regulatory details, barcodes, usage instructions, ingredients, or nutritional information.
   - Non-packaged goods: Any rear, back-plate, underside, bottom-base, or inverted view MUST be classified as "BOP", NEVER "FOP".

3. "LIFESTYLE" (In-Context / Staged Scene):
   - STRICT CRITERIA: Classify as "LIFESTYLE" ONLY when the image depicts:
     a) Human models, people, or visible hands interacting with, holding, demonstrating, or using the product; OR
     b) A real-world domestic or environmental usage setting; OR
     c) A rich multi-element promotional composition where multiple distinct external prop objects are arranged around the product to stage a scene.
   - STRICT EXCLUSION: A standalone product on a plain/white studio backdrop—even with cast shadows, reflections, or subtle surface texture/foam accents behind it—is NEVER "LIFESTYLE". Classify it as "FOP" if upright/front/hero, or "BOP" if rear/back/underside/inverted.

4. "INFOGRAPHIC" (Promotional / Educational Marketing Banner):
   - Scope: Graphic-heavy promotional banners containing marketing badges, text callouts, benefit points, dimension diagrams, or ingredient highlights.

5. "INGREDIENT" (Dedicated Ingredients Panel):
   - Scope: Close-up crop specifically framing the Ingredients declaration.

6. "NUTRITION" (Nutritional Facts Panel):
   - Scope: Dedicated crop framing the Nutrition Facts table.

7. "MANUFACTURER" (Manufacturer & Marketed-By Panel):
   - Scope: Dedicated crop framing manufacturer details, customer care, and MRP.

8. "BARCODE" (Barcode / QR Code Crop):
   - Scope: Dedicated crop framing the UPC/EAN barcode.

9. "FSSAI" (FSSAI Regulatory License Block):
   - Scope: Dedicated crop framing the FSSAI logo and 14-digit license number.
"""


PACKAGING_SUBREGION_RULES = """
=== PACKAGING SUB-REGION EXTRACTION RULES & CRITERIA ===

When decomposing a Back-of-Pack (BOP) or packaging information panel, you must detect exact 2D bounding boxes
normalized strictly from 0 to 1000: [ymin, xmin, ymax, xmax].

1. COORDINATE SYSTEM & BOUNDARY REQUIREMENTS:
   - Coordinates must be integers: 0 <= ymin < ymax <= 1000, 0 <= xmin < xmax <= 1000.
   - Zero Clipping: Bounding boxes must comfortably encompass character ascenders (d, b, h, k, t),
     descenders (g, j, p, q, y), punctuation, enclosing table borders, and logo graphics.
   - Clean Isolation: Do not include unrelated adjacent sections or the variable MRP/batch code stamp.

2. "ingredient" SUB-REGION CRITERIA:
   - Starting Anchor: Begins at the section header ("Ingredients:", "Key Ingredients:", "Composition:").
   - Extent: Encompasses the entire comma-separated ingredient list, percentage breakdown, and allergen
     declaration (e.g., "Contains Peanut, Milk", "May contain traces of tree nuts").

3. "nutritional" SUB-REGION CRITERIA:
   - Scope: The complete Nutritional Information / Facts panel.
   - Extent: Must include the table header ("Nutritional Information", "Typical Values", "Approximate Values"),
     serving size/servings per pack, column headers ("Per 100g", "Per Serve", "% Contribution to RDA"),
     all rows (Energy, Protein, Carbohydrates, Total Sugars, Added Sugars, Fats, Saturated Fat, Trans Fat, Sodium),
     and any footnote disclaimers ("*Per Serve contribution to RDA calculated on basis of 2000 kcal...").

4. "manufactured_by" SUB-REGION CRITERIA:
   - Scope: Complete entity details including "Marketed By:", "Manufactured By:", "Packed By:", or "Imported By:".
   - Extent: Encompasses company registered name, factory/unit addresses, pin codes, country of origin,
     and Consumer Care / Feedback contact information (helpline number, email, website).

5. "fssai" SUB-REGION CRITERIA:
   - Scope: The official statutory food safety license block.
   - Extent: MUST frame BOTH the FSSAI emblem (the distinctive swirl/leaf icon above the word "fssai")
     AND the full 14-digit license number ("Lic. No. XXXXXXXXXXXXXX").

6. "barcode" SUB-REGION CRITERIA:
   - Scope: The retail machine-readable 1D barcode (EAN-13, UPC, Code 128).
   - Extent: MUST encompass the full vertical zebra bars, the human-readable digits printed beneath,
     and the clean white quiet zone margins on the left and right.

7. "directions" SUB-REGION CRITERIA:
   - Scope: Preparation, reconstitution, cooking recipe, or step-by-step usage instructions ("How to Use:", "Directions:").

8. "caution" SUB-REGION CRITERIA:
   - Scope: Statutory warnings, safety notices ("Not for medicinal use", "Keep out of reach of children", "Caution:").

9. "storage" SUB-REGION CRITERIA:
   - Scope: Storage advice ("Store in a cool, dry & hygienic place", "Refrigerate after opening").

10. DYNAMIC STANDALONE CROPPING QUALIFICATION & CATALOG ORDERING:
   - "is_standalone_crop": Set to true dynamically for dedicated e-commerce catalog specification and regulatory assets
     (ingredients, nutritional table, manufacturer details, statutory licensing, barcode).
   - "catalog_sequence": Assign a natural contiguous sequence starting from 1 for the standalone crops detected on this specific package.
   - Set "is_standalone_crop": false and catalog_sequence = null for general body copy that belongs on the main Back-of-Pack view
     (directions, caution, storage).
"""

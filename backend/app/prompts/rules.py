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
=== DYNAMIC PACKAGING SUB-REGION EXTRACTION RULES & OBJECTIVES ===

When decomposing any product packaging (Back-of-Pack, Side-Panels, or Information Panels across diverse product types, sizes, geometries, and languages),
you must detect the exact 2D bounding boxes normalized strictly from 0 to 1000: [ymin, xmin, ymax, xmax].

1. DYNAMIC COORDINATE SYSTEM & UNIVERSAL BOUNDARY PRINCIPLES:
   - Normalized Integer Coordinates: 0 <= ymin < ymax <= 1000, 0 <= xmin < xmax <= 1000.
   - Packaging Invariance: Packaging designs vary drastically across categories (pouches, cartons, bottles, cans, jars, sachets, tubes, blister packs).
     Information panels may appear in any column, orientation, or panel position. Locate the true visual semantic cluster wherever it physically sits.
   - Zero-Clipping & Visual Completeness: Bounding boxes must self-contain the entire semantic section without cutting any character ascenders,
     descenders, outer enclosing border lines, graphics, logos, or trailing footnotes.
   - Natural Margin: Provide a clean 2-3% natural margin (20-30 units) within the normalized coordinate box so text is never flush to the edge.
   - Visual Disambiguation: Detect the visual separator gap between vertically or horizontally adjacent sections (e.g. manufacturer address vs licensing).
     Never let the top or bottom of a box slice horizontally through adjacent unrelated text.

2. "ingredient" (COMPLETE INGREDIENTS & ALLERGEN DECLARATION):
   - Semantic Scope: From the starting section header (e.g., ingredients, composition, active ingredients) through the entire formula breakdown,
     percentages, additives, and complete allergen advisory statement.
   - Dynamic Requirement: Encompass the full continuous visual text block from header to closing period/disclaimer without clipping top or bottom lines.

3. "nutritional" (COMPLETE NUTRITION FACTS PANEL / TABLE):
   - Semantic Scope: The entire nutritional information panel or table in its entirety.
   - Dynamic Requirement: Must encompass outer bounding borders, title header, serving metrics, column headers (per 100g/per serve/% RDA),
     all nutrient rows, and all footnote reference disclaimers. Preserve outer table frame lines with clean padding.

4. "manufactured_by" (COMPLETE ENTITY, MANUFACTURING & CUSTOMER SUPPORT CLUSTER):
   - Semantic Scope: The complete legal entity and corporate hierarchy declared on the packaging.
   - Dynamic Requirement: Encompasses all entity titles (Manufacturer, Marketer, Packer, Importer, Distributor), corporate registered offices,
     manufacturing unit/factory addresses, postal codes, country of origin, and consumer care / customer support contact channels
     (helpline telephone, email, web portal, postal grievance address). Never clip the opening entity title or the closing contact details.

5. "fssai" (COMPLETE STATUTORY FOOD SAFETY REGULATORY BLOCK):
   - Semantic Scope: The entire statutory food safety regulatory block as a unified visual cluster.
   - Dynamic Requirement:
     a) Logo Emblem: Fully frame the official FSSAI emblem (including the upper swirl/leaf graphic above the text).
     b) Wordmark & All Licenses: Include the wordmark and EVERY statutory license number printed in that block (single-license,
        dual-license such as Marketer + Manufacturer, or multi-unit license lines). Never slice horizontally through secondary license lines.
     c) Preceding Separation: Position ymin strictly in the visual gap below any preceding text block so preceding text is never truncated into the crop.

6. "barcode" (MACHINE-READABLE IDENTIFIER):
   - Semantic Scope: 1D linear barcode (EAN, UPC, Code 128) or 2D matrix code.
   - Dynamic Requirement: Fully encompass the zebra bars, human-readable numeric digits beneath, and clear lateral quiet zone margins.

7. "directions", "caution", "storage":
   - Dynamic Requirement: Identify and self-contain preparation/usage steps, safety/warning alerts, or storage guidelines where present.

8. DYNAMIC STANDALONE SPECIFICATION CROPS & CATALOG ORDERING:
   - "is_standalone_crop": Set dynamically to true for dedicated e-commerce catalog specification and regulatory assets
     (ingredients, nutritional table, manufacturer details, statutory licensing, barcode).
   - "catalog_sequence": Sequentially number the standalone crops discovered on this specific package starting from 1 in natural reading order.
   - Set "is_standalone_crop": false and catalog_sequence = null for general narrative pack copy (directions, caution, storage).
"""

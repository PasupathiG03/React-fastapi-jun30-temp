"""
Structured Output Schema for Google Gemini Multimodal Product Classification.
Guarantees 100% compliant JSON responses validated with Pydantic.
"""

GEMINI_CLASSIFICATION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "primary_category": {
            "type": "STRING",
            "enum": ["FOOD", "NON_FOOD", "KITCHEN_ITEMS", "UNKNOWN"],
            "description": (
                "The primary product category. Choose FOOD for edible groceries; "
                "NON_FOOD for personal care, cleaners, buckets, household goods; "
                "KITCHEN_ITEMS for all cookware, utensils, and kitchen storage."
            ),
        },
        "subcategory": {
            "type": "STRING",
            "description": "Granular subcategory (e.g., Cookware, Cookware Set, Hair Care, Beverages, Plasticware, Cutlery, Storage Jars).",
        },
        "product_type": {
            "type": "STRING",
            "description": "Specific product type (e.g., Cookware Set, Cooking Pot, Saucepan, Frying Pan, Pressure Cooker, Shampoo, Plastic Bucket).",
        },
        "is_multi_product_image": {
            "type": "BOOLEAN",
            "description": "True if the image contains multiple distinct products, cookware kit, utensil set, or bundled items; False if single product.",
        },
        "total_detected_products": {
            "type": "INTEGER",
            "description": "Total count of individual identifiable products in the image (e.g. 5 for a 5-piece cookware set, 1 for single item).",
        },
        "detected_products": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "product_type": {
                        "type": "STRING",
                        "description": "Name of this specific detected product (e.g. COOKING_POT, SAUCEPAN, FRYING_PAN, PRESSURE_COOKER, SPATULA, GLASS_LID, KNIFE)."
                    },
                    "quantity": {
                        "type": "INTEGER",
                        "description": "Quantity of this specific product type detected in the image."
                    },
                    "components": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                        "description": "Components belonging to this product (e.g. BODY, SIDE_HANDLES, LONG_HANDLE, GLASS_LID, KNOB, RIM)."
                    },
                    "materials": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                        "description": "Materials for this product (e.g. NON_STICK_COATED_METAL, STAINLESS_STEEL, ALUMINIUM, GLASS, BAKELITE_PLASTIC, WOOD)."
                    },
                    "bounding_box": {
                        "type": "ARRAY",
                        "items": {"type": "INTEGER"},
                        "description": "Optional normalized bounding box coordinates [ymin, xmin, ymax, xmax] between 0 and 1000."
                    }
                },
                "required": ["product_type", "quantity"]
            },
            "description": "Granular list of each distinct individual product detected in the image."
        },
        "materials": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING", "description": "Material name (e.g. STAINLESS_STEEL, ALUMINIUM, NON_STICK_COATING, GLASS, PLASTIC, SILICONE, CERAMIC, WOOD)"},
                    "confidence": {"type": "NUMBER", "description": "Confidence score between 0.0 and 1.0"}
                },
                "required": ["name"]
            },
            "description": "Overall aggregated list of all physical materials detected across the image."
        },
        "components": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": "All physical structural components detected (e.g., HANDLES, LONG_HANDLE, SIDE_HANDLES, LID, GLASS_LID, KNOB, SPOUT, RIM, BODY)."
        },
        "visual_properties": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": "Visual attributes (e.g., REFLECTIVE, GLOSSY, METALLIC, TRANSPARENT_GLASS, THIN_HANDLES)."
        },
        "image_type": {
            "type": "STRING",
            "enum": [
                "FOP", "BOP", "INGREDIENT", "NUTRITION", "MANUFACTURER",
                "FSSAI", "BARCODE", "LIFESTYLE", "INFOGRAPHIC", "OTHER", "UNKNOWN"
            ],
            "description": (
                "Catalog angle/type: "
                "FOP (Front-of-pack, upright hero studio shot, or top view of standalone product); "
                "BOP (Back-of-pack, rear view, underside base, or inverted/upside-down view such as an inverted stool or bucket bottom); "
                "LIFESTYLE (STRICTLY ONLY scenes with human models/hands interacting with the product or composite marketing scenes); "
                "INFOGRAPHIC (Marketing graphic banner with promotional callouts); "
                "INGREDIENT, NUTRITION, MANUFACTURER, BARCODE, FSSAI (close-up text panel crops)."
            ),
        },
        "classification_confidence": {
            "type": "NUMBER",
            "description": "Overall confidence score between 0.0 and 1.0."
        },
        "requires_manual_review": {
            "type": "BOOLEAN",
            "description": "True if ambiguous, low confidence, or unidentifiable packaging; False otherwise."
        },
        "reasoning": {
            "type": "STRING",
            "description": "Concise factual justification for the category classification and multi-product breakdown."
        }
    },
    "required": [
        "primary_category",
        "subcategory",
        "product_type",
        "is_multi_product_image",
        "image_type",
        "classification_confidence",
        "requires_manual_review"
    ]
}

EXAMPLE_OUTPUT = {
    "primary_category": "KITCHEN_ITEMS",
    "subcategory": "COOKWARE",
    "product_type": "COOKWARE_SET",
    "is_multi_product_image": True,
    "total_detected_products": 5,
    "detected_products": [
        {
            "product_type": "COOKING_POT",
            "quantity": 1,
            "components": ["BODY", "SIDE_HANDLES", "GLASS_LID", "KNOB"],
            "materials": ["NON_STICK_COATED_METAL", "GLASS", "BAKELITE_PLASTIC"]
        },
        {
            "product_type": "SAUCEPAN",
            "quantity": 2,
            "components": ["BODY", "LONG_HANDLE", "GLASS_LID", "KNOB"],
            "materials": ["NON_STICK_COATED_METAL", "GLASS", "BAKELITE_PLASTIC"]
        },
        {
            "product_type": "FRYING_PAN",
            "quantity": 2,
            "components": ["PAN_BODY", "LONG_HANDLE"],
            "materials": ["NON_STICK_COATED_METAL", "BAKELITE_PLASTIC"]
        }
    ],
    "materials": [
        {"name": "NON_STICK_COATING", "confidence": 0.98},
        {"name": "ALUMINIUM", "confidence": 0.95},
        {"name": "GLASS", "confidence": 0.95},
        {"name": "BAKELITE_PLASTIC", "confidence": 0.90}
    ],
    "components": ["BODY", "SIDE_HANDLES", "LONG_HANDLE", "GLASS_LID", "KNOB", "PAN_BODY"],
    "visual_properties": ["REFLECTIVE", "GLOSSY", "TRANSPARENT_GLASS", "THIN_HANDLES"],
    "image_type": "FOP",
    "classification_confidence": 0.98,
    "requires_manual_review": False,
    "reasoning": "Multi-piece nonstick cookware set consisting of 1 cooking pot with glass lid, 2 saucepans with glass lids, and 2 frying pans with ergonomic handles."
}


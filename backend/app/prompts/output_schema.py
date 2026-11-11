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


PACKAGING_SUBREGIONS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "detected_regions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "region_type": {
                        "type": "STRING",
                        "enum": [
                            "ingredient", "nutritional", "manufactured_by", "fssai", "barcode",
                            "directions", "caution", "storage"
                        ],
                        "description": "Standard retail packaging sub-region classification."
                    },
                    "display_name": {
                        "type": "STRING",
                        "description": "Human-readable label (e.g. 'Nutritional Information', 'FSSAI License', 'Ingredients')."
                    },
                    "box_2d": {
                        "type": "ARRAY",
                        "items": {"type": "INTEGER"},
                        "description": "[ymin, xmin, ymax, xmax] normalized strictly from 0 to 1000."
                    },
                    "confidence": {
                        "type": "NUMBER",
                        "description": "Confidence score between 0.0 and 1.0."
                    },
                    "is_standalone_crop": {
                        "type": "BOOLEAN",
                        "description": (
                            "Dynamic determination if this sub-region qualifies under e-commerce catalog standards "
                            "as a standalone cropped asset (True for ingredient, nutritional, manufactured_by, "
                            "fssai, and barcode; False for directions, caution, storage, recycling)."
                        )
                    },
                    "catalog_sequence": {
                        "type": "INTEGER",
                        "description": "Dynamic recommended catalog sequence order for standalone crops (1 for ingredient, 2 for nutritional, 3 for manufactured_by, 4 for fssai, 5 for barcode; null if not standalone)."
                    },
                    "text_summary": {
                        "type": "STRING",
                        "description": "Brief summary or opening words of the detected section."
                    }
                },
                "required": ["region_type", "display_name", "box_2d", "confidence", "is_standalone_crop"]
            }
        }
    },
    "required": ["detected_regions"]
}


EXAMPLE_SUBREGIONS_OUTPUT = {
    "detected_regions": [
        {
            "region_type": "ingredient",
            "display_name": "Ingredients",
            "box_2d": [326, 333, 353, 664],
            "confidence": 0.98,
            "is_standalone_crop": True,
            "catalog_sequence": 1,
            "text_summary": "Ingredients: Jaggery, Peanuts, Butter, Cardamom."
        },
        {
            "region_type": "nutritional",
            "display_name": "Nutritional Information",
            "box_2d": [557, 339, 738, 522],
            "confidence": 0.99,
            "is_standalone_crop": True,
            "catalog_sequence": 2,
            "text_summary": "Nutritional Facts table with Energy 517 kcal, Protein 19.8g."
        },
        {
            "region_type": "manufactured_by",
            "display_name": "Marketed & Manufactured By",
            "box_2d": [397, 319, 531, 632],
            "confidence": 0.96,
            "is_standalone_crop": True,
            "catalog_sequence": 3,
            "text_summary": "Marketed By: GO DESi Mandi Pvt Ltd, Bengaluru."
        },
        {
            "region_type": "fssai",
            "display_name": "FSSAI License",
            "box_2d": [673, 548, 702, 651],
            "confidence": 0.99,
            "is_standalone_crop": True,
            "catalog_sequence": 4,
            "text_summary": "FSSAI Logo and Lic. No. 11221332000766"
        },
        {
            "region_type": "barcode",
            "display_name": "Barcode",
            "box_2d": [624, 547, 664, 650],
            "confidence": 0.99,
            "is_standalone_crop": True,
            "catalog_sequence": 5,
            "text_summary": "EAN-13: 8906108896502"
        },
        {
            "region_type": "directions",
            "display_name": "Directions to Use",
            "box_2d": [450, 200, 520, 600],
            "confidence": 0.95,
            "is_standalone_crop": False,
            "catalog_sequence": None,
            "text_summary": "How to wash clothes in washing machine."
        }
    ]
}


MRP_EXPIRY_STAMPS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "has_removable_stamps": {
            "type": "BOOLEAN",
            "description": "True only if an actual variable VALUE (price amount, unit price amount, expiry/mfg date, or batch code) is printed on the packaging. Empty field labels alone do not count."
        },
        "stamps": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "stamp_type": {
                        "type": "STRING",
                        "enum": ["mrp", "expiry_date", "mfg_date", "batch_code"],
                        "description": "The functional category of the variable value to be inpainted. Labels/headers are never returned."
                    },
                    "display_name": {
                        "type": "STRING",
                        "description": "Descriptive title for the detected element."
                    },
                    "box_2d": {
                        "type": "ARRAY",
                        "items": {"type": "INTEGER"},
                        "description": "Normalized bounding box [ymin, xmin, ymax, xmax] scaled strictly between 0 and 1000."
                    },
                    "text_content": {
                        "type": "STRING",
                        "description": "Exact characters of the variable value inside the box, excluding its label."
                    },
                    "confidence": {
                        "type": "NUMBER",
                        "description": "Confidence score between 0.0 and 1.0."
                    }
                },
                "required": ["stamp_type", "box_2d", "text_content"]
            },
            "description": "Every variable price/date/batch VALUE on the packaging, each boxed without its label."
        }
    },
    "required": ["has_removable_stamps", "stamps"]
}


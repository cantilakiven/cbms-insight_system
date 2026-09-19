library(haven)
library(dplyr)
library(jsonlite)
library(zip)

# 1. Define target objects
target_files <- c(
  "cbms_barangay_record",
  "cbms_barangay_record_list",
  "cbms_household_record",
  "cbms_household_record_child_mortality",
  "cbms_interview_record",
  "cbms_person_record",
  "cbms_person_record_tvet"
)

# 2. Determine cross-platform Downloads directory path
download_path <- file.path(Sys.getenv("USERPROFILE"), "Downloads")
if (Sys.getenv("USERPROFILE") == "" || !dir.exists(download_path)) {
  download_path <- file.path(path.expand("~"), "Downloads")
}

# 3. Create a temporary folder to store JSON outputs
temp_dir <- file.path(tempdir(), "cbms_json_export")
if (!dir.exists(temp_dir)) dir.create(temp_dir, recursive = TRUE)

json_filepaths <- c()

# 4. Helper function to process and clean individual data frames
clean_and_export_json <- function(df, filename, output_dir) {
  # Clean labelled and factor vectors (PSA/CBMS data formatting)
  df_clean <- df %>%
    mutate(across(where(is.labelled), ~ as.character(as_factor(.)))) %>%
    mutate(across(where(is.factor), as.character))
  
  # Strip attributes and flatten lists
  df_clean <- lapply(df_clean, function(x) {
    if (is.list(x)) x <- unlist(x)
    return(x)
  })
  df_clean <- as.data.frame(df_clean)
  
  # Convert to JSON string
  json_data <- jsonlite::toJSON(
    df_clean,
    pretty = TRUE,
    auto_unbox = TRUE,
    na = "null",
    dataframe = "rows",
    null = "null"
  )
  
  # Output path
  out_path <- file.path(output_dir, paste0(filename, ".json"))
  write(json_data, out_path)
  return(out_path)
}

# 5. Loop over all target objects
for (file_name in target_files) {
  # Retrieve data frame whether it exists in global environment or inside a 'data' list
  df_obj <- NULL
  if (exists(file_name, envir = .GlobalEnv)) {
    df_obj <- get(file_name, envir = .GlobalEnv)
  } else if (exists("data") && is.list(data) && file_name %in% names(data)) {
    df_obj <- data[[file_name]]
  }
  
  if (!is.null(df_obj)) {
    cat("Processing:", file_name, "...\n")
    saved_path <- clean_and_export_json(df_obj, file_name, temp_dir)
    json_filepaths <- c(json_filepaths, saved_path)
  } else {
    warning(paste("Object", file_name, "was not found in R environment."))
  }
}

# 6. Compress into a single zip file in Downloads
zip_filename <- file.path(download_path, paste0("CBMS_JSON_Export_", format(Sys.Date(), "%Y%m%d"), ".zip"))

zip::zipr(
  zipfile = zip_filename,
  files = json_filepaths,
  mode = "cherry-pick"
)

cat("\n==========================================\n")
cat("SUCCESS! All available JSON files saved to:\n")
cat(zip_filename, "\n")
cat("==========================================\n")

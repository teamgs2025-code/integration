/**************************************************************************************
Script Name: 	UNI RES POST Lead Creation (Refactored)
Developer:  	Puram Srihitha (Refactored)
Company Name:   BirlaSoft
Purpose: 		Lead Creation with improved structure
Date: 			22nd Sep 2021 (Refactored)
 ****************************************************************************************/

// Constants for better maintainability
const CONSTANTS = {
    ENTITY_STATUS: {
        LEAD: 20,
        CUSTOMER: 6
    },
    SUBSIDIARY: {
        INDIA: 27
    },
    CUSTOMER_STATUS: {
        PROSPECT: 8,
        CONVERTED: 11
    },
    LEAD_SOURCE: {
        DTC_WEB: 28254233,
        DTC_WEB_TEXT: "DTC-WEB"
    },
    DEVICE_CATEGORIES: {
        AIR_PURIFIER: 7,
        WATER_PURIFIER: 42,
        PREMIUM: 1,
        CORE: 2
    },
    SUB_SOURCES: {
        META: 1
    },
    FORM_IDS: {
        LEAD_FORM: '264'
    },
    TIME_LIMITS: {
        DTC_LEAD_DAYS: 180,
        RFS_ORDER_DAYS: 3
    },
    BYPASS_LMS: {
        CORE_ONLY: '1',
        PREMIUM_ONLY: '2',
        BOTH: '3',
        NONE: '4',
        ALL: '5'
    }
};

/**
 * Main RESTlet function for lead creation
 * @param {Object} datain - Input data from request
 * @returns {Object} JSON response object
 */
function UNI_RES_POST_LeadCreation(datain) {
    nlapiLogExecution('DEBUG', 'UNI_RES_POST_LeadCreation', 'Starting lead creation process');
    nlapiLogExecution('DEBUG', 'datain', JSON.stringify(datain));

    try {
        const responseObj = createhomedemo(datain);
        create_log_record(datain, responseObj);
        
        return buildResponseObject(responseObj);
    } catch (error) {
        nlapiLogExecution('ERROR', 'UNI_RES_POST_LeadCreation', 'Error: ' + error.toString());
        return buildErrorResponse('Unexpected error occurred: ' + error.toString());
    }
}

/**
 * Build standardized response object
 */
function buildResponseObject(responseObj) {
    return {
        "message": responseObj['message'],
        "responseCode": responseObj['responseCode'],
        "data": [{
            "customer_id": responseObj['customer_id'],
            "deviceCategory": responseObj['deviceCategory']
        }]
    };
}

/**
 * Build error response object
 */
function buildErrorResponse(message, customerId = '', deviceCategory = '') {
    return {
        "message": message,
        "responseCode": "0",
        "data": [{
            "customer_id": customerId,
            "deviceCategory": deviceCategory
        }]
    };
}

/**
 * Main lead creation logic
 */
function createhomedemo(customerObj) {
    const responseObj = initializeResponse();
    
    // Input validation
    const validationResult = validateCustomerInput(customerObj);
    if (!validationResult.isValid) {
        return buildValidationErrorResponse(validationResult.message);
    }
    
    const customerData = extractCustomerData(customerObj);
    
    // Check existing customer
    const existingCustomer = searchCustomerByMobileNo(customerData.mobile);
    
    if (shouldCreateNewLead(existingCustomer, customerData)) {
        return processNewLeadCreation(customerData, responseObj);
    } else {
        return processExistingCustomer(existingCustomer, customerData, responseObj);
    }
}

/**
 * Initialize response object
 */
function initializeResponse() {
    return {
        'message': '',
        'responseCode': '',
        'customer_id': '',
        'deviceCategory': ''
    };
}

/**
 * Validate customer input data
 */
function validateCustomerInput(customerObj) {
    if (!customerObj.mobile) {
        return { isValid: false, message: 'Failed! Phone Number is blank' };
    }
    if (!customerObj.name) {
        return { isValid: false, message: 'Error:: Name is blank' };
    }
    return { isValid: true };
}

/**
 * Build validation error response
 */
function buildValidationErrorResponse(message) {
    return {
        'message': message,
        'responseCode': '0',
        'customer_id': '',
        'deviceCategory': ''
    };
}

/**
 * Extract and clean customer data from input
 */
function extractCustomerData(customerObj) {
    return {
        name: customerObj.name,
        mobile: customerObj.mobile,
        email: customerObj.email,
        pincode: customerObj.pinCode,
        demoDate: customerObj.demoDate,
        airPurifier: customerObj.airPurifier,
        deviceType: customerObj.deviceType,
        deviceCategory: customerObj.deviceCategory,
        subSource: customerObj.demo_type,
        utmMedium: truncateField(customerObj.utm_medium, 300),
        utmCampaign: truncateField(customerObj.utm_campaign, 300),
        utmUrl: truncateField(customerObj.utm_url, 300),
        utmSource: truncateField(customerObj.leadSource, 300)
    };
}

/**
 * Truncate field to specified length
 */
function truncateField(value, maxLength) {
    if (!value) return '';
    return value.length > maxLength ? value.slice(0, maxLength - 1) : value;
}

/**
 * Determine if a new lead should be created
 */
function shouldCreateNewLead(existingCustomer, customerData) {
    if (!existingCustomer.entityid) {
        return true; // No existing customer
    }
    
    if (existingCustomer.entitystatus == CONSTANTS.ENTITY_STATUS.LEAD && 
        existingCustomer.leadsource === CONSTANTS.LEAD_SOURCE.DTC_WEB_TEXT) {
        return shouldReactivateDTCLead(existingCustomer);
    }
    
    return false;
}

/**
 * Check if DTC lead should be reactivated based on time
 */
function shouldReactivateDTCLead(existingCustomer) {
    if (!existingCustomer.datecreated) return false;
    
    const daysDiff = calculateDaysDifference(existingCustomer.datecreated);
    nlapiLogExecution('DEBUG', 'shouldReactivateDTCLead', 'Days difference: ' + daysDiff);
    
    if (daysDiff >= CONSTANTS.TIME_LIMITS.DTC_LEAD_DAYS) {
        deactivateOldCustomer(existingCustomer.internalid);
        return true;
    }
    
    return false;
}

/**
 * Calculate days difference from a date string
 */
function calculateDaysDifference(dateString) {
    const year = Number(dateString.slice(6, 10));
    const month = Number(dateString.slice(3, 5)) - 1;
    const day = Number(dateString.slice(0, 2));
    
    const pastDate = new Date(year, month, day);
    const currentDate = getCurrentISTDate();
    
    const timeDiff = currentDate.getTime() - pastDate.getTime();
    return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
}

/**
 * Get current IST date
 */
function getCurrentISTDate() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 5.5));
}

/**
 * Deactivate old customer record
 */
function deactivateOldCustomer(custInternalId) {
    try {
        const oldCustRecord = nlapiLoadRecord('customer', custInternalId);
        oldCustRecord.setFieldValue('isinactive', 'T');
        nlapiSubmitRecord(oldCustRecord, true, true);
        nlapiLogExecution('DEBUG', 'deactivateOldCustomer', 'Deactivated customer: ' + custInternalId);
    } catch (error) {
        nlapiLogExecution('ERROR', 'deactivateOldCustomer', 'Error deactivating customer: ' + error);
    }
}

/**
 * Process new lead creation
 */
function processNewLeadCreation(customerData, responseObj) {
    // Get area details
    const areaDetails = getAreaDetails(customerData.pincode);
    
    if (!areaDetails.isValid) {
        return createLeadWithoutArea(customerData, responseObj);
    }
    
    return createLeadWithArea(customerData, areaDetails, responseObj);
}

/**
 * Get area details for a pincode
 */
function getAreaDetails(pincode) {
    if (!pincode) {
        return { isValid: false, message: 'Pincode is blank' };
    }
    
    const areaid = searchArea(pincode);
    if (!areaid) {
        return { isValid: false, message: 'Area not found for pincode' };
    }
    
    const areaData = searchAreaMasterDetails(areaid);
    if (areaData.isinactive === 'T') {
        return { isValid: false, message: 'Area is inactive' };
    }
    
    const cityData = searchCity(areaData.custrecord_in_city_parent);
    if (cityData.isinactive === 'T') {
        return { isValid: false, message: 'City is inactive' };
    }
    
    const symphonyData = searchSymphony(areaid);
    if (!symphonyData.custrecord_symphonyname) {
        return { isValid: false, message: 'Outlet not found for the area selected' };
    }
    
    return {
        isValid: true,
        areaid: areaid,
        areaData: areaData,
        cityData: cityData,
        symphonyData: symphonyData
    };
}

/**
 * Create lead with area information
 */
function createLeadWithArea(customerData, areaDetails, responseObj) {
    try {
        const leadData = buildLeadDataWithArea(customerData, areaDetails);
        const custId = createLeadRecord(leadData);
        
        if (custId) {
            const newCustomer = nlapiLoadRecord('customer', custId);
            const entityId = newCustomer.getFieldValue('entityid');
            const customerId = entityId.split(" ")[0];
            
            // Handle bypass LMS logic
            handleBypassLMS(custId, customerData, areaDetails);
            
            // Send SMS
            sendWelcomeSMS(customerData.mobile, entityId, customerId);
            
            return buildSuccessResponse(customerId, customerData.deviceCategory);
        }
    } catch (error) {
        nlapiLogExecution('ERROR', 'createLeadWithArea', 'Error: ' + error);
        return buildValidationErrorResponse('Error:: ' + error);
    }
}

/**
 * Build lead data object with area information
 */
function buildLeadDataWithArea(customerData, areaDetails) {
    const symphonyDetails = searchParentCustomer(areaDetails.symphonyData.custrecord_symphonyname);
    
    return {
        ...customerData,
        areaDetails: areaDetails,
        symphonyDetails: symphonyDetails,
        fullAddress: buildFullAddress(customerData, areaDetails)
    };
}

/**
 * Build full address string
 */
function buildFullAddress(customerData, areaDetails) {
    return [
        customerData.name,
        areaDetails.areaData.name,
        areaDetails.cityData.name,
        areaDetails.areaData.custrecord_state,
        '-',
        areaDetails.areaData.custrecord_pincode
    ].join(' ');
}

/**
 * Create lead record in NetSuite
 */
function createLeadRecord(leadData) {
    const custRecord = nlapiCreateRecord('lead');
    
    // Set basic fields
    setBasicLeadFields(custRecord, leadData);
    
    // Set area-related fields
    if (leadData.areaDetails) {
        setAreaFields(custRecord, leadData);
    }
    
    // Set address book
    setAddressBook(custRecord, leadData);
    
    // Set additional fields
    setAdditionalFields(custRecord);
    
    return nlapiSubmitRecord(custRecord, true, true);
}

/**
 * Set basic lead fields
 */
function setBasicLeadFields(custRecord, leadData) {
    custRecord.setFieldValue('entitystatus', CONSTANTS.ENTITY_STATUS.LEAD);
    custRecord.setFieldValue('subsidiary', CONSTANTS.SUBSIDIARY.INDIA);
    custRecord.setFieldValue('firstname', leadData.name);
    custRecord.setFieldValue('lastname', '.');
    custRecord.setFieldValue('mobilephone', leadData.mobile);
    custRecord.setFieldValue('phone', leadData.mobile);
    custRecord.setFieldValue('custentity_b2b_cont1', leadData.mobile);
    custRecord.setFieldValue('email', leadData.email);
    custRecord.setFieldValue('leadsource', CONSTANTS.LEAD_SOURCE.DTC_WEB);
    
    // Set device category
    const deviceCategory = getDeviceCategory(leadData);
    custRecord.setFieldValue('custentity_demorequest', deviceCategory);
    
    // Set UTM fields
    setUTMFields(custRecord, leadData);
    
    // Set other fields
    custRecord.setFieldValue('custentity_in_customer_status', CONSTANTS.CUSTOMER_STATUS.PROSPECT);
    custRecord.setFieldValue('custentity_in_digital_lead', 'T');
    custRecord.setFieldValue('customform', CONSTANTS.FORM_IDS.LEAD_FORM);
    
    if (leadData.demoDate) {
        custRecord.setFieldValue('custentity_in__demo_date', leadData.demoDate);
    }
    if (leadData.deviceType) {
        custRecord.setFieldValue('custentity_in_interested_device_name', leadData.deviceType);
    }
}

/**
 * Get device category based on air purifier flag
 */
function getDeviceCategory(leadData) {
    if (leadData.airPurifier === 'T') {
        return leadData.deviceCategory || CONSTANTS.DEVICE_CATEGORIES.AIR_PURIFIER;
    }
    return leadData.deviceCategory || CONSTANTS.DEVICE_CATEGORIES.WATER_PURIFIER;
}

/**
 * Set UTM tracking fields
 */
function setUTMFields(custRecord, leadData) {
    if (leadData.subSource === "Meta") {
        custRecord.setFieldValue('custentity_dtcsubsource', CONSTANTS.SUB_SOURCES.META);
    }
    
    if (leadData.utmMedium) {
        custRecord.setFieldValue('custentity_utmmedium', leadData.utmMedium);
    }
    if (leadData.utmCampaign) {
        custRecord.setFieldValue('custentity_utmcompaign', leadData.utmCampaign);
    }
    if (leadData.utmUrl) {
        custRecord.setFieldValue('custentity_utmurl', leadData.utmUrl);
    }
    if (leadData.utmSource) {
        custRecord.setFieldValue('custentity_utmsource', leadData.utmSource);
    }
    
    if (leadData.airPurifier === 'T') {
        custRecord.setFieldValue('custentity_air_purifier', leadData.airPurifier);
    }
}

/**
 * Set area-related fields
 */
function setAreaFields(custRecord, leadData) {
    const { areaDetails } = leadData;
    
    custRecord.setFieldValue('custentity_state', areaDetails.cityData.custrecord_city_state);
    custRecord.setFieldValue('custentity_in_city', areaDetails.areaData.custrecord_in_city_parent);
    custRecord.setFieldValue('custentityarea', areaDetails.areaid);
    custRecord.setFieldValue('custentity_in_sales_zone', areaDetails.areaData.custrecord_saleszone);
    custRecord.setFieldValue('custentity_in_zone', areaDetails.areaData.custrecord_zone);
    custRecord.setFieldValue('custentity_in_std_code', areaDetails.areaData.custrecord_stdcode);
    custRecord.setFieldValue('custentity_serviceable', areaDetails.areaData.custrecord_serviceable);
    custRecord.setFieldValue('custentity_symphonyarea', areaDetails.areaData.custrecord_symphony);
    
    // Set sales rep and CDO fields if available
    if (leadData.symphonyDetails) {
        const salesrepDetails = serachEmployee(leadData.symphonyDetails.salesrep);
        const cdoDetails = serachEmployee(leadData.symphonyDetails.custentity_cdo_tl_gl);
        
        if (salesrepDetails.isinactive !== 'T') {
            custRecord.setFieldValue('salesrep', leadData.symphonyDetails.salesrep);
        }
        if (cdoDetails.isinactive !== 'T') {
            custRecord.setFieldValue('custentity_cdo_tl_gl', leadData.symphonyDetails.custentity_cdo_tl_gl);
        }
    }
    
    // Set municipal limit status
    setMunicipalLimitStatus(custRecord, areaDetails);
}

/**
 * Set municipal limit status
 */
function setMunicipalLimitStatus(custRecord, areaDetails) {
    const cdoDetails = searchCDOOperationalAreaName(areaDetails.areaid);
    if (cdoDetails.custrecord_area_int_id) {
        const municipalStatus = searchCDOOperationalAreaid(cdoDetails.custrecord_area_int_id);
        
        if (municipalStatus == 1) {
            custRecord.setFieldValue('custentity_lead_within_municiple_limit', 'T');
        } else if (municipalStatus == 2) {
            custRecord.setFieldValue('custentity_lead_within_municiple_limit', 'F');
        }
    }
}

/**
 * Set address book information
 */
function setAddressBook(custRecord, leadData) {
    custRecord.selectNewLineItem('addressbook');
    custRecord.setCurrentLineItemValue('addressbook', 'defaultbilling', 'T');
    custRecord.setCurrentLineItemValue('addressbook', 'defaultshipping', 'T');
    
    if (leadData.areaDetails) {
        custRecord.setCurrentLineItemValue('addressbook', 'city', leadData.areaDetails.cityData.name);
        custRecord.setCurrentLineItemValue('addressbook', 'state', leadData.areaDetails.areaData.custrecord_state);
        custRecord.setCurrentLineItemValue('addressbook', 'zip', leadData.areaDetails.areaData.custrecord_pincode);
        custRecord.setCurrentLineItemValue('addressbook', 'addrtext', leadData.fullAddress);
    }
    
    custRecord.commitLineItem('addressbook');
}

/**
 * Set additional fields
 */
function setAdditionalFields(custRecord) {
    custRecord.setFieldValue('custentity_in_digital_lead', 'T');
    custRecord.setFieldValue('customform', CONSTANTS.FORM_IDS.LEAD_FORM);
}

/**
 * Handle bypass LMS logic
 */
function handleBypassLMS(custId, customerData, areaDetails) {
    try {
        const bypassRecord = nlapiLoadRecord('customrecord_bypass_lms', 2);
        const blmsCategory = bypassRecord.getFieldValue('custrecord_select_bypass_category');
        
        const cdoDetails = searchCDOOperationalAreaName(areaDetails.areaid);
        const lspPartnerName = cdoDetails.custrecord_cdo_name;
        
        const updateFields = getBypassLMSFields(blmsCategory, customerData.deviceType, lspPartnerName);
        
        if (updateFields.length > 0) {
            nlapiSubmitField('lead', custId, updateFields.fields, updateFields.values);
        }
    } catch (error) {
        nlapiLogExecution('ERROR', 'handleBypassLMS', 'Error: ' + error);
    }
}

/**
 * Get bypass LMS field updates
 */
function getBypassLMSFields(blmsCategory, deviceType, lspPartnerName) {
    const fields = ['custentity_bypass_category_lead', 'customform'];
    const values = [blmsCategory, CONSTANTS.FORM_IDS.LEAD_FORM];
    
    const shouldAssignLSP = (
        (blmsCategory === CONSTANTS.BYPASS_LMS.CORE_ONLY && deviceType == CONSTANTS.DEVICE_CATEGORIES.CORE) ||
        (blmsCategory === CONSTANTS.BYPASS_LMS.PREMIUM_ONLY && deviceType == CONSTANTS.DEVICE_CATEGORIES.PREMIUM) ||
        (blmsCategory === CONSTANTS.BYPASS_LMS.BOTH && (deviceType == CONSTANTS.DEVICE_CATEGORIES.CORE || deviceType == CONSTANTS.DEVICE_CATEGORIES.PREMIUM)) ||
        (blmsCategory === CONSTANTS.BYPASS_LMS.ALL)
    );
    
    if (shouldAssignLSP && lspPartnerName) {
        fields.push('parent', 'custentity_prob_status', 'custentity_lspassign');
        values.push(lspPartnerName, '2', 'T');
    }
    
    return { fields, values };
}

/**
 * Create lead without area information (for invalid pincode)
 */
function createLeadWithoutArea(customerData, responseObj) {
    try {
        const custRecord = nlapiCreateRecord('lead');
        setBasicLeadFields(custRecord, customerData);
        custRecord.setFieldValue('custentity_recheck_required', 'T');
        
        const custId = nlapiSubmitRecord(custRecord, true, true);
        
        if (custId) {
            const newCustomer = nlapiLoadRecord('customer', custId);
            const entityId = newCustomer.getFieldValue('entityid');
            const customerId = entityId.split(" ")[0];
            
            sendWelcomeSMS(customerData.mobile, entityId, customerId);
            
            return buildSuccessResponse(customerId, customerData.deviceCategory);
        }
    } catch (error) {
        nlapiLogExecution('ERROR', 'createLeadWithoutArea', 'Error: ' + error);
        return buildValidationErrorResponse('Error:: ' + error);
    }
}

/**
 * Process existing customer
 */
function processExistingCustomer(existingCustomer, customerData, responseObj) {
    if (existingCustomer.entitystatus == CONSTANTS.ENTITY_STATUS.LEAD) {
        return handleExistingLead(existingCustomer, customerData, responseObj);
    } else {
        return handleExistingCustomer(existingCustomer, customerData, responseObj);
    }
}

/**
 * Handle existing lead follow-up
 */
function handleExistingLead(existingCustomer, customerData, responseObj) {
    try {
        const loadRecord = nlapiLoadRecord('customer', existingCustomer.internalid);
        const currentFollowupCount = existingCustomer.followupCount || 0;
        loadRecord.setFieldValue('custentity_lead_follow_up_count', parseInt(currentFollowupCount) + 1);
        nlapiSubmitRecord(loadRecord, true, true);
        
        const currentDate = getCurrentISTDate();
        return {
            'message': `Lead record already exists. Lead ID: ${existingCustomer.entityid}. Updated follow up date: ${currentDate}`,
            'responseCode': '1',
            'customer_id': existingCustomer.entityid,
            'deviceCategory': customerData.deviceCategory
        };
    } catch (error) {
        nlapiLogExecution('ERROR', 'handleExistingLead', 'Error: ' + error);
        return buildValidationErrorResponse('Error updating existing lead: ' + error);
    }
}

/**
 * Handle existing customer
 */
function handleExistingCustomer(existingCustomer, customerData, responseObj) {
    return {
        'message': `Customer already exists. Customer ID: ${existingCustomer.entityid}`,
        'responseCode': '1',
        'customer_id': existingCustomer.entityid,
        'deviceCategory': customerData.deviceCategory
    };
}

/**
 * Build success response
 */
function buildSuccessResponse(customerId, deviceCategory) {
    return {
        'message': 'Record added',
        'responseCode': '1',
        'customer_id': customerId,
        'deviceCategory': deviceCategory
    };
}

/**
 * Send welcome SMS
 */
function sendWelcomeSMS(mobile, entityId, customerId) {
    try {
        const smsText = `Congratulations! Your request for a home demo has been successfully placed with reference number ${entityId}. Our team will contact you within 24 hours for confirmation. If you don't hear from us, please write to pureit@aosmith.com or call 1800 570 1000.`;
        
        nlapiLogExecution('DEBUG', 'sendWelcomeSMS', smsText);
        SendSMStowebsiteFromMarketing(mobile, smsText, customerId);
    } catch (error) {
        nlapiLogExecution('ERROR', 'sendWelcomeSMS', 'Error sending SMS: ' + error);
    }
}

// ================================================== UTILITY FUNCTIONS ==================================================

/**
 * Search for CDO Operational Area Name
 */
function searchCDOOperationalAreaName(areaid) {
    nlapiLogExecution('DEBUG', 'searchCDOOperationalAreaName', 'areaid=' + areaid);
    
    const areaDetails = {
        'custrecord_area_int_id': '',
        'custrecord_cdo_name': ''
    };
    
    if (!areaid) return areaDetails;
    
    try {
        const filters = [
            new nlobjSearchFilter('custrecord_area_int_id', null, 'is', areaid),
            new nlobjSearchFilter('isinactive', null, 'is', 'F')
        ];
        
        const columns = [
            new nlobjSearchColumn('custrecord_area_int_id'),
            new nlobjSearchColumn('custrecord_cdo_name')
        ];
        
        const results = nlapiSearchRecord('customrecord_cdo_opr_area', null, filters, columns);
        
        if (results && results.length > 0) {
            areaDetails['custrecord_area_int_id'] = results[0].getValue('custrecord_area_int_id');
            areaDetails['custrecord_cdo_name'] = results[0].getValue('custrecord_cdo_name');
        }
    } catch (error) {
        nlapiLogExecution('ERROR', 'searchCDOOperationalAreaName', 'Error: ' + error);
    }
    
    return areaDetails;
}

/**
 * Search for CDO Operational Area ID
 */
function searchCDOOperationalAreaid(areainternalid) {
    nlapiLogExecution('DEBUG', 'searchCDOOperationalAreaid', 'areainternalid=' + areainternalid);
    
    if (!areainternalid) return null;
    
    try {
        const results = nlapiSearchRecord("customrecord_in_pondy_areas", null, [
            ["internalidnumber", "equalto", areainternalid],
            "AND", ["isinactive", "is", "F"]
        ], [
            new nlobjSearchColumn("custrecord_municipal_limits")
        ]);
        
        if (results && results.length > 0) {
            return results[0].getValue('custrecord_municipal_limits');
        }
    } catch (error) {
        nlapiLogExecution('ERROR', 'searchCDOOperationalAreaid', 'Error: ' + error);
    }
    
    return null;
}

/**
 * Search for Symphony details
 */
function searchSymphony(areaintid) {
    nlapiLogExecution('DEBUG', 'searchSymphony', 'areaintid=' + areaintid);
    
    const symphonyDetails = { 'custrecord_symphonyname': 0 };
    
    if (!areaintid) return symphonyDetails;
    
    try {
        const filters = [
            new nlobjSearchFilter('custrecord_area_int_id', null, 'is', areaintid),
            new nlobjSearchFilter('isinactive', null, 'is', 'F')
        ];
        
        const columns = [new nlobjSearchColumn('custrecord_cdo_name')];
        
        const results = nlapiSearchRecord('customrecord_cdo_opr_area', null, filters, columns);
        
        if (results && results.length > 0) {
            symphonyDetails['custrecord_symphonyname'] = results[0].getValue('custrecord_cdo_name');
        }
    } catch (error) {
        nlapiLogExecution('ERROR', 'searchSymphony', 'Error: ' + error);
    }
    
    return symphonyDetails;
}

/**
 * Search for city details
 */
function searchCity(areaCity) {
    nlapiLogExecution('DEBUG', 'searchCity', 'areaCity=' + areaCity);
    
    const cityDetails = {
        'name': '',
        'isinactive': '',
        'custrecord_city_state': ''
    };
    
    if (!areaCity) return cityDetails;
    
    try {
        const filters = [new nlobjSearchFilter('internalid', null, 'is', areaCity)];
        const columns = [
            new nlobjSearchColumn('isinactive'),
            new nlobjSearchColumn('name'),
            new nlobjSearchColumn('custrecord_city_state')
        ];
        
        const results = nlapiSearchRecord('customrecord_in_city_rt', null, filters, columns);
        
        if (results && results.length > 0) {
            cityDetails['name'] = results[0].getValue('name');
            cityDetails['isinactive'] = results[0].getValue('isinactive');
            cityDetails['custrecord_city_state'] = results[0].getValue('custrecord_city_state');
        }
    } catch (error) {
        nlapiLogExecution('ERROR', 'searchCity', 'Error: ' + error);
    }
    
    return cityDetails;
}

/**
 * Search for area by pincode
 */
function searchArea(pincode) {
    nlapiLogExecution('DEBUG', 'searchArea', 'pincode=' + pincode);
    
    if (!pincode) return null;
    
    try {
        const filters = [
            new nlobjSearchFilter('custrecord_pincode', null, 'is', pincode),
            new nlobjSearchFilter('isinactive', null, 'is', 'F')
        ];
        
        const columns = [
            new nlobjSearchColumn('name'),
            new nlobjSearchColumn('internalid').setSort(false)
        ];
        
        const results = nlapiSearchRecord('customrecord_in_pondy_areas', null, filters, columns);
        
        if (results && results.length > 0) {
            return results[0].getValue('internalid');
        }
    } catch (error) {
        nlapiLogExecution('ERROR', 'searchArea', 'Error: ' + error);
    }
    
    return null;
}

/**
 * Search for area master details
 */
function searchAreaMasterDetails(areaId) {
    nlapiLogExecution('DEBUG', 'searchAreaMasterDetails', 'areaId=' + areaId);
    
    const areaDetails = {
        'custrecord_state': '',
        'custrecord_in_city_parent': '',
        'name': '',
        'custrecord_zone': '',
        'custrecord_pincode': '',
        'custrecord_saleszone': '',
        'custrecord_serviceable': '',
        'custrecord_symphony': '',
        'custrecord_stdcode': '',
        'isinactive': ''
    };
    
    if (!areaId) return areaDetails;
    
    try {
        const filters = [new nlobjSearchFilter('internalid', null, 'is', areaId)];
        const columns = [
            new nlobjSearchColumn('custrecord_state'),
            new nlobjSearchColumn('custrecord_in_city_parent'),
            new nlobjSearchColumn('name'),
            new nlobjSearchColumn('custrecord_zone'),
            new nlobjSearchColumn('custrecord_pincode'),
            new nlobjSearchColumn('custrecord_saleszone'),
            new nlobjSearchColumn('custrecord_serviceable'),
            new nlobjSearchColumn('custrecord_stdcode'),
            new nlobjSearchColumn('custrecord_symphony'),
            new nlobjSearchColumn('isinactive')
        ];
        
        const results = nlapiSearchRecord('customrecord_in_pondy_areas', null, filters, columns);
        
        if (results && results.length > 0) {
            const result = results[0];
            Object.keys(areaDetails).forEach(key => {
                areaDetails[key] = result.getValue(key.replace('custrecord_', 'custrecord_')) || '';
            });
        }
    } catch (error) {
        nlapiLogExecution('ERROR', 'searchAreaMasterDetails', 'Error: ' + error);
    }
    
    return areaDetails;
}

/**
 * Search for parent customer details
 */
function searchParentCustomer(parentintid) {
    nlapiLogExecution('DEBUG', 'searchParentCustomer', 'parentintid=' + parentintid);
    
    const parentDetails = {
        'entityid': 0,
        'salesrep': '',
        'custentity_cdo_tl_gl': ''
    };
    
    if (!parentintid) return parentDetails;
    
    try {
        const filters = [new nlobjSearchFilter('internalid', null, 'is', parentintid)];
        const columns = [
            new nlobjSearchColumn('entityid'),
            new nlobjSearchColumn('salesrep'),
            new nlobjSearchColumn('custentity_cdo_tl_gl')
        ];
        
        const results = nlapiSearchRecord('customer', null, filters, columns);
        
        if (results && results.length > 0) {
            parentDetails['entityid'] = results[0].getValue('entityid');
            parentDetails['salesrep'] = results[0].getValue('salesrep');
            parentDetails['custentity_cdo_tl_gl'] = results[0].getValue('custentity_cdo_tl_gl');
        }
    } catch (error) {
        nlapiLogExecution('ERROR', 'searchParentCustomer', 'Error: ' + error);
    }
    
    return parentDetails;
}

/**
 * Search for employee details
 */
function serachEmployee(empintid) {
    nlapiLogExecution('DEBUG', 'serachEmployee', 'empintid=' + empintid);
    
    const empDetails = { 'isinactive': '' };
    
    if (!empintid) return empDetails;
    
    try {
        const filters = [new nlobjSearchFilter('internalid', null, 'is', empintid)];
        const columns = [new nlobjSearchColumn('isinactive')];
        
        const results = nlapiSearchRecord('employee', null, filters, columns);
        
        if (results && results.length > 0) {
            empDetails['isinactive'] = results[0].getValue('isinactive');
        }
    } catch (error) {
        nlapiLogExecution('ERROR', 'serachEmployee', 'Error: ' + error);
    }
    
    return empDetails;
}

/**
 * Search for customer by mobile number
 */
function searchCustomerByMobileNo(mobileNo) {
    const customerDetails = {
        'entityid': '',
        'internalid': '',
        'deviceCategory': '',
        'entitystatus': '',
        'custentity_lead_follow_up_count': '',
        'custentity_lead_status_management': '',
        'custentity_in_date_created': '',
        'leadsource': '',
        'custentity_previous_soi': '',
        'datecreated': ''
    };
    
    if (!mobileNo) return customerDetails;
    
    try {
        const filters = [
            new nlobjSearchFilter('phone', null, 'is', mobileNo),
            new nlobjSearchFilter('isinactive', null, 'is', 'F')
        ];
        
        const columns = [
            new nlobjSearchColumn('entityid'),
            new nlobjSearchColumn('internalid'),
            new nlobjSearchColumn('entitystatus'),
            new nlobjSearchColumn('custentity_lead_follow_up_count'),
            new nlobjSearchColumn('custentity_lead_status_management'),
            new nlobjSearchColumn('custentity_in_date_created'),
            new nlobjSearchColumn('leadsource'),
            new nlobjSearchColumn('custentity_previous_soi'),
            new nlobjSearchColumn('datecreated'),
            new nlobjSearchColumn('custentity_devicecategory')
        ];
        
        const results = nlapiSearchRecord('customer', null, filters, columns);
        
        if (results && results.length > 0) {
            const result = results[0];
            customerDetails['entityid'] = result.getValue('entityid');
            customerDetails['internalid'] = result.getValue('internalid');
            customerDetails['entitystatus'] = result.getValue('entitystatus');
            customerDetails['custentity_lead_follow_up_count'] = result.getValue('custentity_lead_follow_up_count');
            customerDetails['custentity_lead_status_management'] = result.getValue('custentity_lead_status_management');
            customerDetails['custentity_in_date_created'] = result.getValue('custentity_in_date_created');
            customerDetails['leadsource'] = result.getText('leadsource');
            customerDetails['custentity_previous_soi'] = result.getValue('custentity_previous_soi');
            customerDetails['datecreated'] = result.getValue('datecreated');
            customerDetails['deviceCategory'] = result.getValue('custentity_devicecategory');
        }
    } catch (error) {
        nlapiLogExecution('ERROR', 'searchCustomerByMobileNo', 'Error: ' + error);
    }
    
    return customerDetails;
}

/**
 * Create log record for audit trail
 */
function create_log_record(customerObj, responseObj) {
    try {
        const logRecord = nlapiCreateRecord('customrecord_uni_logs_dtc_integration');
        
        logRecord.setFieldValue('custrecord_uni_logs_consumername', customerObj.name || '');
        logRecord.setFieldValue('custrecord_uni_logs_mobile_number', customerObj.mobile || '');
        logRecord.setFieldValue('custrecord_uni_logs_emailid', customerObj.email || '');
        logRecord.setFieldValue('custrecord_uni_logs_pincode', customerObj.pinCode || '');
        logRecord.setFieldValue('custrecord_uni_logs_purifiertype', 
            (customerObj.airPurifier === 'T' ? 'Air Purifier' : 'Water Purifier'));
        logRecord.setFieldValue('custrecord_uni_logs_date_stamped', nlapiDateToString(new Date()));
        logRecord.setFieldValue('custrecord_uni_logs_status', 
            (responseObj["responseCode"] != 0 ? 'Pass' : 'Fail'));
        logRecord.setFieldValue('custrecord_uni_logs_scriptnumber', '2156');
        logRecord.setFieldValue('custrecord_uni_logs_ns_rsponse', JSON.stringify(responseObj));
        
        const submittedId = nlapiSubmitRecord(logRecord, true, true);
        nlapiLogExecution('DEBUG', 'create_log_record', 'Log created with ID: ' + submittedId);
    } catch (error) {
        nlapiLogExecution('ERROR', 'create_log_record', 'Error creating log: ' + error);
    }
}

/**
 * Send SMS to customer
 */
function SendSMStowebsiteFromMarketing(destMobileNo, smsBody, customerId) {
    try {
        const formattedMobile = '91' + destMobileNo;
        const encodedMessage = encodeURIComponent(smsBody);
        
        const smsUrl = `https://enterprise.smsgupshup.com/GatewayAPI/rest?method=SendMessage&send_to=${formattedMobile}&msg=${encodedMessage}&msg_id=${customerId}&msg_type=TEXT&userid=2000184905&auth_scheme=plain&password=FMnanF&v=1.1&format=text&linkTrakingEnabled=TRUE`;
        
        const response = nlapiRequestURL(smsUrl, null, null, 'POST');
        
        nlapiLogExecution('DEBUG', 'SendSMStowebsiteFromMarketing', 'SMS sent. Response code: ' + response.getCode());
        
        return response.getCode();
    } catch (error) {
        nlapiLogExecution('ERROR', 'SendSMStowebsiteFromMarketing', 'Error sending SMS: ' + error);
        
        // Retry logic for connection issues
        if (error.name === 'SSS_CONNECTION_CLOSED') {
            try {
                const retryResponse = nlapiRequestURL(smsUrl, null, null, 'POST');
                return retryResponse.getCode();
            } catch (retryError) {
                nlapiLogExecution('ERROR', 'SendSMStowebsiteFromMarketing', 'Retry failed: ' + retryError);
            }
        }
        
        return '0';
    }
}
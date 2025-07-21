import React, { useState } from 'react';
import { Box, Typography, Grid, Card, CardContent, CardActions, Button, Switch, FormControlLabel } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const PricingSection = () => {
  const [isYearly, setIsYearly] = useState(false);

  const handleToggle = () => {
    setIsYearly((prev) => !prev);
  };

  const pricingPlans = [
    {
      title: 'Essential',
      priceMonthly: 19,
      priceYearly: 39,
      features: [
        'Lead, deal, contact, calendar and pipeline management',
        'Seamless data import and 400+ integrations',
        '24/7, multi-language support',
      ],
    },
    {
      title: 'Professional',
      priceMonthly: 49,
      priceYearly: 69,
      features: [
        'Full email sync with templates, open, click tracking & emailing',
        'Automations builder, including email sequences',
        'Meeting, email and video call',
      ],
    },
    {
      title: 'Enterprise',
      priceMonthly: 129,
      priceYearly: 199,
      features: [
        'Streamlined lead routing and account access control',
        'Document and contract management with e-signatures',
        'Revenue forecasts & reporting',
      ],
    },
  ];

  return (
    <Box sx={{ py: 6, backgroundColor: 'lightgrey' }}>
      <Box textAlign="center" mb={4}>
        <Typography variant="h4" component="h2" gutterBottom>
          Discover the right price plan for you
        </Typography>
        <FormControlLabel
          control={<Switch checked={isYearly} onChange={handleToggle} />}
          label={isYearly ? 'Per Year' : 'Per Month'}
        />
      </Box>

      <Grid container spacing={4} justifyContent="center">
        {pricingPlans.map((plan, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <Card
              sx={{
                boxShadow: 3,
                border: plan.title === 'Professional' ? '2px solid #1976d2' : 'none',
              }}
            >
              <CardContent>
                <Box textAlign="center" mb={2}>
                  <Typography variant="h5" component="h3">
                    {plan.title}
                  </Typography>
                  <Typography variant="h4" component="div" color="primary">
                    ${isYearly ? plan.priceYearly : plan.priceMonthly}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {isYearly ? '/Per Year' : '/Per Month'}
                  </Typography>
                </Box>

                <Typography variant="subtitle1" gutterBottom>
                  Key features:
                </Typography>
                <ul>
                  {plan.features.map((feature, idx) => (
                    <li key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      <CheckCircleIcon color="success" fontSize="small" sx={{ mr: 1 }} />
                      <Typography variant="body2" component="span">
                        {feature}
                      </Typography>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardActions>
                <Button
                  variant={plan.title === 'Professional' ? 'contained' : 'outlined'}
                  fullWidth
                  color="primary"
                >
                  Purchase now
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default PricingSection;